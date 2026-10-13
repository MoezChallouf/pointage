import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { db, initDatabase } from '../server/db.js';

// Ces tests d'intégration nécessitent une base Supabase/PostgreSQL.
// Ils sont ignorés automatiquement si SUPABASE_DB_URL n'est pas défini.
const hasDb = Boolean(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite('Tests d\'intégration du système de pointage (Postgres/Supabase)', () => {
  before(async () => {
    await initDatabase();
  });

  test('La base de données initialise les 5 employés et les paramètres', async () => {
    const empCount = (await db.prepare('SELECT COUNT(*)::int as count FROM employees').get()).count;
    assert.ok(empCount >= 5);

    const settings = await db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
    assert.equal(settings.company_name, 'Société Tunisienne de Services');
    assert.equal(settings.timezone, 'Africa/Tunis');
  });

  test('Vérification sécurisée du code PIN par hachage salé', async () => {
    const amine = await db.prepare('SELECT * FROM employees WHERE id = ?').get('emp-001');
    assert.ok(amine);
    assert.ok(bcrypt.compareSync('1234', amine.pin_hash));
    assert.equal(bcrypt.compareSync('9999', amine.pin_hash), false);
  });

  test('Interdiction de créer un second shift ouvert (index partiel)', async () => {
    const testRecordId = `test-att-${Date.now()}`;
    await db.prepare('DELETE FROM attendance_records WHERE employee_id = ? AND clock_out_at IS NULL').run('emp-001');

    await db.prepare(`
      INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
      VALUES (?, 'emp-001', '2026-10-13', ?, NULL, 'IN_PROGRESS')
    `).run(testRecordId, new Date().toISOString());

    await assert.rejects(
      db.prepare(`
        INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
        VALUES (?, 'emp-001', '2026-10-13', ?, NULL, 'IN_PROGRESS')
      `).run(`test-att-dup-${Date.now()}`, new Date().toISOString()),
      /duplicate key|unique/i
    );

    await db.prepare('DELETE FROM attendance_records WHERE id = ?').run(testRecordId);
  });

  test('Vérification de l\'authentification administrateur', async () => {
    const admin = await db.prepare('SELECT * FROM admin_users WHERE email = ?').get('admin@pointagerh.tn');
    assert.ok(admin);
    assert.ok(bcrypt.compareSync('Admin@2026!', admin.password_hash));
    assert.equal(bcrypt.compareSync('WrongPassword', admin.password_hash), false);
  });
});
