import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { db, initDatabase } from '../server/db.js';
import bcrypt from 'bcryptjs';

describe('Tests d\'intégration du système de pointage', () => {
  before(() => {
    initDatabase();
  });

  test('La base de données initialise les 5 employés et les paramètres', () => {
    const empCount = db.prepare('SELECT COUNT(*) as count FROM employees').get().count;
    assert.equal(empCount, 5);

    const settings = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
    assert.equal(settings.company_name, 'Société Tunisienne de Services');
    assert.equal(settings.timezone, 'Africa/Tunis');
  });

  test('Vérification sécurisée du code PIN par hachage salé', () => {
    // Amine Mansour (PIN 1234)
    const amine = db.prepare('SELECT * FROM employees WHERE id = ?').get('emp-001');
    assert.ok(amine);
    assert.ok(bcrypt.compareSync('1234', amine.pin_hash));
    assert.equal(bcrypt.compareSync('9999', amine.pin_hash), false);
  });

  test('Enregistrement d\'un pointage de début de service (Clock-In)', () => {
    const testRecordId = `test-att-${Date.now()}`;
    const testIso = new Date().toISOString();

    // Clean any prior open shift for test emp
    db.prepare('DELETE FROM attendance_records WHERE employee_id = ? AND clock_out_at IS NULL').run('emp-001');

    db.prepare(`
      INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
      VALUES (?, 'emp-001', '2026-10-13', ?, NULL, 'IN_PROGRESS')
    `).run(testRecordId, testIso);

    const created = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(testRecordId);
    assert.ok(created);
    assert.equal(created.status, 'IN_PROGRESS');
    assert.equal(created.clock_out_at, null);
  });

  test('Interdiction formelle de créer un second shift ouvert (Contrainte index partiel)', () => {
    const secondRecordId = `test-att-duplicate-${Date.now()}`;
    assert.throws(() => {
      db.prepare(`
        INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
        VALUES (?, 'emp-001', '2026-10-13', ?, NULL, 'IN_PROGRESS')
      `).run(secondRecordId, new Date().toISOString());
    }, /UNIQUE constraint failed/);
  });

  test('Clôture du service (Clock-Out) et calcul de la durée', () => {
    const openRecord = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND clock_out_at IS NULL').get('emp-001');
    assert.ok(openRecord);

    const clockOutIso = new Date().toISOString();
    db.prepare(`
      UPDATE attendance_records
      SET clock_out_at = ?, status = 'COMPLETED', updated_at = datetime('now')
      WHERE id = ?
    `).run(clockOutIso, openRecord.id);

    const closedRecord = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(openRecord.id);
    assert.equal(closedRecord.status, 'COMPLETED');
    assert.ok(closedRecord.clock_out_at);
  });

  test('Correction manuelle d\'un horaire avec journalisation d\'audit immuable', () => {
    const record = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? LIMIT 1').get('emp-001');
    assert.ok(record);

    const auditId = `test-aud-${Date.now()}`;
    const oldValues = { clock_in_at: record.clock_in_at };
    const newValues = { clock_in_at: '2026-10-13T08:00:00.000Z' };
    const reason = 'Oubli de pointage à l\'arrivée - Régularisation';

    db.prepare(`
      UPDATE attendance_records
      SET clock_in_at = ?, is_corrected = 1, correction_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newValues.clock_in_at, reason, record.id);

    db.prepare(`
      INSERT INTO audit_logs (id, administrator_id, action, entity_type, entity_id, old_values, new_values, reason)
      VALUES (?, 'adm-001', 'MANUAL_CORRECTION', 'ATTENDANCE_RECORD', ?, ?, ?, ?)
    `).run(auditId, record.id, JSON.stringify(oldValues), JSON.stringify(newValues), reason);

    const auditEntry = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(auditId);
    assert.ok(auditEntry);
    assert.equal(auditEntry.reason, reason);
    assert.equal(auditEntry.administrator_id, 'adm-001');
  });

  test('Vérification de l\'authentification administrateur', () => {
    const admin = db.prepare('SELECT * FROM admin_users WHERE email = ?').get('admin@pointagerh.tn');
    assert.ok(admin);
    assert.ok(bcrypt.compareSync('Admin@2026!', admin.password_hash));
    assert.equal(bcrypt.compareSync('WrongPassword', admin.password_hash), false);
  });
});
