import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

// Ensure data directory exists
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'attendance.db');
export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for high reliability and ACID compliance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      company_name TEXT NOT NULL DEFAULT 'Société Tunisienne de Services',
      timezone TEXT NOT NULL DEFAULT 'Africa/Tunis',
      expected_start_time TEXT NOT NULL DEFAULT '08:00',
      expected_end_time TEXT NOT NULL DEFAULT '17:00',
      late_grace_minutes INTEGER NOT NULL DEFAULT 15,
      working_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
      long_shift_hours REAL NOT NULL DEFAULT 10.0,
      missing_clock_out_hours REAL NOT NULL DEFAULT 12.0,
      break_tracking_enabled INTEGER NOT NULL DEFAULT 0,
      unpaid_break_minutes INTEGER NOT NULL DEFAULT 60,
      early_departure_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      employee_number TEXT UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      department TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL, -- Local Tunis date: YYYY-MM-DD
      clock_in_at TEXT,   -- ISO UTC timestamp
      clock_out_at TEXT,  -- ISO UTC timestamp (null if open)
      break_minutes INTEGER NOT NULL DEFAULT 0,
      break_started_at TEXT, -- ISO UTC timestamp if currently on break
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'COMPLETED', 'ANOMALY'
      is_corrected INTEGER NOT NULL DEFAULT 0,
      correction_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT
    );

    -- Enforce at most one open shift per employee
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_shift 
    ON attendance_records (employee_id) 
    WHERE clock_out_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_attendance_employee_date 
    ON attendance_records (employee_id, date);

    CREATE INDEX IF NOT EXISTS idx_attendance_date 
    ON attendance_records (date);

    CREATE TABLE IF NOT EXISTS attendance_events (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      attendance_record_id TEXT,
      event_type TEXT NOT NULL, -- 'CLOCK_IN', 'CLOCK_OUT', 'START_BREAK', 'END_BREAK', 'MANUAL_CORRECTION'
      event_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'SYSTEM',
      metadata TEXT, -- JSON string safe metadata without PINs
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (attendance_record_id) REFERENCES attendance_records(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS anomalies (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      attendance_record_id TEXT,
      anomaly_type TEXT NOT NULL, -- 'MISSING_CLOCK_IN', 'MISSING_CLOCK_OUT', 'LATE_ARRIVAL', 'EARLY_DEPARTURE', 'LONG_SHIFT', 'CONFLICTING_SHIFT', 'MISSING_ATTENDANCE'
      severity TEXT NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH'
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolved_by TEXT,
      resolution_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (attendance_record_id) REFERENCES attendance_records(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_anomalies_status 
    ON anomalies (status);

    CREATE INDEX IF NOT EXISTS idx_anomalies_employee 
    ON anomalies (employee_id);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      administrator_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_values TEXT, -- JSON string
      new_values TEXT, -- JSON string
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at 
    ON audit_logs (created_at DESC);
  `);

  // Seed default company settings if missing
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM company_settings').get() as { count: number };
  if (settingsCount.count === 0) {
    db.prepare(`
      INSERT INTO company_settings (
        id, company_name, timezone, expected_start_time, expected_end_time,
        late_grace_minutes, working_days, long_shift_hours, missing_clock_out_hours,
        break_tracking_enabled, unpaid_break_minutes, early_departure_enabled
      ) VALUES (
        1, 'Société Tunisienne de Services', 'Africa/Tunis', '08:00', '17:00',
        15, '[1,2,3,4,5]', 10.0, 12.0, 0, 60, 1
      )
    `).run();
  }

  // Seed default admin user if missing
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get() as { count: number };
  if (adminCount.count === 0) {
    const adminPasswordHash = bcrypt.hashSync('Admin@2026!', 10);
    db.prepare(`
      INSERT INTO admin_users (id, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('adm-001', 'admin@pointagerh.tn', adminPasswordHash, 'Directeur RH', 'admin');
  }

  // Seed initial 5 employees if empty
  const empCount = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };
  if (empCount.count === 0) {
    const defaultEmployees = [
      { id: 'emp-001', num: 'EMP-101', first: 'Amine', last: 'Mansour', pin: '1234', dept: 'Informatique & Systèmes', notes: 'Développeur Senior' },
      { id: 'emp-002', num: 'EMP-102', first: 'Fatma', last: 'Ben Ali', pin: '2345', dept: 'Ressources Humaines', notes: 'Responsable Paie et RH' },
      { id: 'emp-003', num: 'EMP-103', first: 'Mohamed', last: 'Trabelsi', pin: '3456', dept: 'Logistique & Exploitation', notes: 'Coordinateur des opérations' },
      { id: 'emp-004', num: 'EMP-104', first: 'Sarra', last: 'Khemir', pin: '4567', dept: 'Service Client', notes: 'Chargée des relations clients' },
      { id: 'emp-005', num: 'EMP-105', first: 'Youssef', last: 'Chahed', pin: '5678', dept: 'Commercial', notes: 'Responsable grands comptes' },
    ];

    for (const emp of defaultEmployees) {
      const pinHash = bcrypt.hashSync(emp.pin, 10);
      db.prepare(`
        INSERT INTO employees (id, employee_number, first_name, last_name, pin_hash, is_active, department, notes)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(emp.id, emp.num, emp.first, emp.last, pinHash, emp.dept, emp.notes);
    }

    // Seed realistic attendance records for the past few days so dashboard, history, and anomalies have authentic data immediately
    seedHistoricalAttendance();
  }
}

function seedHistoricalAttendance() {
  // Let's seed recent days: yesterday and 2 days ago
  const now = new Date();
  
  // Format helper for Tunis local dates
  function formatLocalDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const d1 = new Date(now.getTime() - 24 * 3600 * 1000); // yesterday
  const d2 = new Date(now.getTime() - 48 * 3600 * 1000); // 2 days ago

  const date1Str = formatLocalDate(d1);
  const date2Str = formatLocalDate(d2);

  // Day -2 (2 days ago): all 5 clocked in normally
  const recordsDay2 = [
    { empId: 'emp-001', inTime: `${date2Str}T07:58:00.000Z`, outTime: `${date2Str}T17:05:00.000Z` },
    { empId: 'emp-002', inTime: `${date2Str}T08:02:00.000Z`, outTime: `${date2Str}T17:00:00.000Z` },
    { empId: 'emp-003', inTime: `${date2Str}T08:10:00.000Z`, outTime: `${date2Str}T17:15:00.000Z` },
    { empId: 'emp-004', inTime: `${date2Str}T08:00:00.000Z`, outTime: `${date2Str}T16:55:00.000Z` },
    { empId: 'emp-005', inTime: `${date2Str}T08:05:00.000Z`, outTime: `${date2Str}T17:10:00.000Z` },
  ];

  for (let i = 0; i < recordsDay2.length; i++) {
    const r = recordsDay2[i];
    const recId = `att-d2-${i + 1}`;
    db.prepare(`
      INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
      VALUES (?, ?, ?, ?, ?, 'COMPLETED')
    `).run(recId, r.empId, date2Str, r.inTime, r.outTime);

    db.prepare(`
      INSERT INTO attendance_events (id, employee_id, attendance_record_id, event_type, event_at)
      VALUES (?, ?, ?, 'CLOCK_IN', ?)
    `).run(`evt-d2-in-${i + 1}`, r.empId, recId, r.inTime);

    db.prepare(`
      INSERT INTO attendance_events (id, employee_id, attendance_record_id, event_type, event_at)
      VALUES (?, ?, ?, 'CLOCK_OUT', ?)
    `).run(`evt-d2-out-${i + 1}`, r.empId, recId, r.outTime);
  }

  // Day -1 (yesterday):
  // Amine: normal
  // Fatma: normal
  // Mohamed: arrived late at 08:35 (Anomaly: LATE_ARRIVAL)
  // Sarra: completed normal
  // Youssef: forgot to clock out (clock_out_at is NULL, Anomaly: MISSING_CLOCK_OUT)
  const recAmine = `att-d1-1`;
  db.prepare(`
    INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
    VALUES (?, 'emp-001', ?, ?, ?, 'COMPLETED')
  `).run(recAmine, date1Str, `${date1Str}T07:55:00.000Z`, `${date1Str}T17:02:00.000Z`);

  const recFatma = `att-d1-2`;
  db.prepare(`
    INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
    VALUES (?, 'emp-002', ?, ?, ?, 'COMPLETED')
  `).run(recFatma, date1Str, `${date1Str}T08:01:00.000Z`, `${date1Str}T17:00:00.000Z`);

  // Mohamed: late arrival
  const recMohamed = `att-d1-3`;
  db.prepare(`
    INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
    VALUES (?, 'emp-003', ?, ?, ?, 'ANOMALY')
  `).run(recMohamed, date1Str, `${date1Str}T08:35:00.000Z`, `${date1Str}T17:30:00.000Z`);

  db.prepare(`
    INSERT INTO anomalies (id, employee_id, attendance_record_id, anomaly_type, severity, description, status, detected_at)
    VALUES (?, 'emp-003', ?, 'LATE_ARRIVAL', 'LOW', 'Arrivée tardive à 08:35 (tolérance 08:15 dépassée de 20 min)', 'OPEN', ?)
  `).run('anom-001', recMohamed, `${date1Str}T08:35:05.000Z`);

  // Sarra: completed
  const recSarra = `att-d1-4`;
  db.prepare(`
    INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
    VALUES (?, 'emp-004', ?, ?, ?, 'COMPLETED')
  `).run(recSarra, date1Str, `${date1Str}T07:59:00.000Z`, `${date1Str}T17:04:00.000Z`);

  // Youssef: forgot to clock out yesterday (closed or flagged)
  const recYoussef = `att-d1-5`;
  db.prepare(`
    INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
    VALUES (?, 'emp-005', ?, ?, NULL, 'ANOMALY')
  `).run(recYoussef, date1Str, `${date1Str}T08:04:00.000Z`);

  db.prepare(`
    INSERT INTO anomalies (id, employee_id, attendance_record_id, anomaly_type, severity, description, status, detected_at)
    VALUES (?, 'emp-005', ?, 'MISSING_CLOCK_OUT', 'HIGH', 'Départ non enregistré : le pointage est resté ouvert au-delà du seuil de 12 heures', 'OPEN', ?)
  `).run('anom-002', recYoussef, `${date1Str}T20:05:00.000Z`);
}
