import postgres from 'postgres';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Postgres (Supabase) connection
// ---------------------------------------------------------------------------
// SUPABASE_DB_URL : chaîne de connexion "Connection pooling - Transaction"
// (port 6543) fournie par Supabase. On utilise `prepare: false` car le
// transaction pooler (pgbouncer) ne supporte pas les requêtes préparées.
// ---------------------------------------------------------------------------

let _sql: postgres.Sql | null = null;

export function getSql(): postgres.Sql {
  if (_sql) return _sql;

  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Variable d\'environnement SUPABASE_DB_URL manquante. Renseignez la chaîne de connexion PostgreSQL Supabase dans .env'
    );
  }

  _sql = postgres(url, {
    prepare: false,
    ssl: 'require',
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
  });

  return _sql;
}

// Convertit les requêtes de style SQLite (? -> $1, $2 ...) et les fonctions
// de date SQLite (datetime('now') -> now()).
function toPostgres(query: string): string {
  let index = 0;
  return query
    .replace(/datetime\(\s*'now'\s*\)/gi, 'now()')
    .replace(/\?/g, () => `$${++index}`);
}

export async function runQuery(query: string, params: any[] = []): Promise<any[]> {
  const sql = getSql();
  const text = toPostgres(query);
  const result = await sql.unsafe(text, params);
  return result as unknown as any[];
}

// Façade compatible avec l'ancienne API synchrone SQLite
// (db.prepare(sql).get/all/run), mais asynchrone.
export const db = {
  prepare(query: string) {
    return {
      get: async (...params: any[]): Promise<any> => {
        const rows = await runQuery(query, params);
        return rows[0];
      },
      all: async (...params: any[]): Promise<any[]> => {
        return await runQuery(query, params);
      },
      run: async (...params: any[]): Promise<{ changes: number }> => {
        await runQuery(query, params);
        return { changes: 1 };
      },
    };
  },
  // Les transactions explicites BEGIN/COMMIT/ROLLBACK ne sont plus utilisées :
  // chaque opération est exécutée séquentiellement. Conservé pour compatibilité.
  exec: async (_statement: string): Promise<void> => {
    return;
  },
};

// ---------------------------------------------------------------------------
// Initialisation / données de départ
// ---------------------------------------------------------------------------

export async function initDatabase(): Promise<void> {
  await createSchema();
  await seedDatabase();
}

// Crée le schéma si nécessaire (idempotent). Le même script est fourni dans
// supabase/migrations pour exécution manuelle, mais le serveur s'en charge
// automatiquement au premier démarrage.
export async function createSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS company_settings (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       company_name TEXT NOT NULL DEFAULT 'Société Tunisienne de Services',
       timezone TEXT NOT NULL DEFAULT 'Africa/Tunis',
       expected_start_time TEXT NOT NULL DEFAULT '08:00',
       expected_end_time TEXT NOT NULL DEFAULT '17:00',
       late_grace_minutes INTEGER NOT NULL DEFAULT 15,
       working_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
       long_shift_hours DOUBLE PRECISION NOT NULL DEFAULT 10.0,
       missing_clock_out_hours DOUBLE PRECISION NOT NULL DEFAULT 12.0,
       break_tracking_enabled INTEGER NOT NULL DEFAULT 0,
       unpaid_break_minutes INTEGER NOT NULL DEFAULT 60,
       early_departure_enabled INTEGER NOT NULL DEFAULT 1,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );`,
    `CREATE TABLE IF NOT EXISTS admin_users (
       id TEXT PRIMARY KEY,
       email TEXT UNIQUE NOT NULL,
       password_hash TEXT NOT NULL,
       name TEXT NOT NULL,
       role TEXT NOT NULL DEFAULT 'admin',
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );`,
    `CREATE TABLE IF NOT EXISTS employees (
       id TEXT PRIMARY KEY,
       employee_number TEXT UNIQUE,
       first_name TEXT NOT NULL,
       last_name TEXT NOT NULL,
       pin_hash TEXT NOT NULL,
       is_active INTEGER NOT NULL DEFAULT 1,
       department TEXT,
       notes TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );`,
    `CREATE TABLE IF NOT EXISTS attendance_records (
       id TEXT PRIMARY KEY,
       employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
       date TEXT NOT NULL,
       clock_in_at TIMESTAMPTZ,
       clock_out_at TIMESTAMPTZ,
       break_minutes INTEGER NOT NULL DEFAULT 0,
       break_started_at TIMESTAMPTZ,
       status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
       is_corrected INTEGER NOT NULL DEFAULT 0,
       correction_reason TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_shift
       ON attendance_records (employee_id) WHERE clock_out_at IS NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records (employee_id, date);`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records (date);`,
    `CREATE TABLE IF NOT EXISTS attendance_events (
       id TEXT PRIMARY KEY,
       employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
       attendance_record_id TEXT REFERENCES attendance_records(id) ON DELETE SET NULL,
       event_type TEXT NOT NULL,
       event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       created_by TEXT NOT NULL DEFAULT 'SYSTEM',
       metadata TEXT
     );`,
    `CREATE TABLE IF NOT EXISTS anomalies (
       id TEXT PRIMARY KEY,
       employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
       attendance_record_id TEXT REFERENCES attendance_records(id) ON DELETE SET NULL,
       anomaly_type TEXT NOT NULL,
       severity TEXT NOT NULL DEFAULT 'MEDIUM',
       description TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'OPEN',
       detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       resolved_at TIMESTAMPTZ,
       resolved_by TEXT,
       resolution_notes TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );`,
    `CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies (status);`,
    `CREATE INDEX IF NOT EXISTS idx_anomalies_employee ON anomalies (employee_id);`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
       id TEXT PRIMARY KEY,
       administrator_id TEXT NOT NULL,
       action TEXT NOT NULL,
       entity_type TEXT NOT NULL,
       entity_id TEXT NOT NULL,
       old_values TEXT,
       new_values TEXT,
       reason TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);`,
  ];

  for (const statement of statements) {
    await runQuery(statement);
  }
}

export async function seedDatabase(): Promise<void> {
  // 1. Paramètres entreprise
  await runQuery(
    `INSERT INTO company_settings (
       id, company_name, timezone, expected_start_time, expected_end_time,
       late_grace_minutes, working_days, long_shift_hours, missing_clock_out_hours,
       break_tracking_enabled, unpaid_break_minutes, early_departure_enabled
     ) VALUES (
       1, 'Société Tunisienne de Services', 'Africa/Tunis', '08:00', '17:00',
       15, '[1,2,3,4,5]', 10.0, 12.0, 0, 60, 1
     ) ON CONFLICT (id) DO NOTHING;`
  );

  // 2. Administrateur par défaut
  const adminCountRows = await runQuery(`SELECT COUNT(*)::int AS count FROM admin_users;`);
  if ((adminCountRows[0]?.count ?? 0) === 0) {
    const adminPasswordHash = bcrypt.hashSync('Admin@2026!', 10);
    await runQuery(
      `INSERT INTO admin_users (id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING;`,
      ['adm-001', 'admin@pointagerh.tn', adminPasswordHash, 'Directeur RH', 'admin']
    );
  }

  // 3. Employés de démonstration
  const empCountRows = await runQuery(`SELECT COUNT(*)::int AS count FROM employees;`);
  if ((empCountRows[0]?.count ?? 0) === 0) {
    const defaultEmployees = [
      { id: 'emp-001', num: 'EMP-101', first: 'Amine', last: 'Mansour', pin: '1234', dept: 'Informatique & Systèmes', notes: 'Développeur Senior' },
      { id: 'emp-002', num: 'EMP-102', first: 'Fatma', last: 'Ben Ali', pin: '2345', dept: 'Ressources Humaines', notes: 'Responsable Paie et RH' },
      { id: 'emp-003', num: 'EMP-103', first: 'Mohamed', last: 'Trabelsi', pin: '3456', dept: 'Logistique & Exploitation', notes: 'Coordinateur des opérations' },
      { id: 'emp-004', num: 'EMP-104', first: 'Sarra', last: 'Khemir', pin: '4567', dept: 'Service Client', notes: 'Chargée des relations clients' },
      { id: 'emp-005', num: 'EMP-105', first: 'Youssef', last: 'Chahed', pin: '5678', dept: 'Commercial', notes: 'Responsable grands comptes' },
    ];

    for (const emp of defaultEmployees) {
      const pinHash = bcrypt.hashSync(emp.pin, 10);
      await runQuery(
        `INSERT INTO employees (id, employee_number, first_name, last_name, pin_hash, is_active, department, notes)
         VALUES ($1, $2, $3, $4, $5, 1, $6, $7) ON CONFLICT (id) DO NOTHING;`,
        [emp.id, emp.num, emp.first, emp.last, pinHash, emp.dept, emp.notes]
      );
    }

    await seedHistoricalAttendance();
  }
}

async function seedHistoricalAttendance(): Promise<void> {
  const now = new Date();

  function formatLocalDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const d1 = new Date(now.getTime() - 24 * 3600 * 1000);
  const d2 = new Date(now.getTime() - 48 * 3600 * 1000);

  const date1Str = formatLocalDate(d1);
  const date2Str = formatLocalDate(d2);

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
    await runQuery(
      `INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
       VALUES ($1, $2, $3, $4, $5, 'COMPLETED') ON CONFLICT (id) DO NOTHING;`,
      [recId, r.empId, date2Str, r.inTime, r.outTime]
    );
    await runQuery(
      `INSERT INTO attendance_events (id, employee_id, attendance_record_id, event_type, event_at)
       VALUES ($1, $2, $3, 'CLOCK_IN', $4) ON CONFLICT (id) DO NOTHING;`,
      [`evt-d2-in-${i + 1}`, r.empId, recId, r.inTime]
    );
    await runQuery(
      `INSERT INTO attendance_events (id, employee_id, attendance_record_id, event_type, event_at)
       VALUES ($1, $2, $3, 'CLOCK_OUT', $4) ON CONFLICT (id) DO NOTHING;`,
      [`evt-d2-out-${i + 1}`, r.empId, recId, r.outTime]
    );
  }

  const recAmine = 'att-d1-1';
  await runQuery(
    `INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
     VALUES ($1, 'emp-001', $2, $3, $4, 'COMPLETED') ON CONFLICT (id) DO NOTHING;`,
    [recAmine, date1Str, `${date1Str}T07:55:00.000Z`, `${date1Str}T17:02:00.000Z`]
  );

  const recFatma = 'att-d1-2';
  await runQuery(
    `INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
     VALUES ($1, 'emp-002', $2, $3, $4, 'COMPLETED') ON CONFLICT (id) DO NOTHING;`,
    [recFatma, date1Str, `${date1Str}T08:01:00.000Z`, `${date1Str}T17:00:00.000Z`]
  );

  const recMohamed = 'att-d1-3';
  await runQuery(
    `INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
     VALUES ($1, 'emp-003', $2, $3, $4, 'ANOMALY') ON CONFLICT (id) DO NOTHING;`,
    [recMohamed, date1Str, `${date1Str}T08:35:00.000Z`, `${date1Str}T17:30:00.000Z`]
  );
  await runQuery(
    `INSERT INTO anomalies (id, employee_id, attendance_record_id, anomaly_type, severity, description, status, detected_at)
     VALUES ('anom-001', 'emp-003', $1, 'LATE_ARRIVAL', 'LOW', $2, 'OPEN', $3) ON CONFLICT (id) DO NOTHING;`,
    [recMohamed, 'Arrivée tardive à 08:35 (tolérance 08:15 dépassée de 20 min)', `${date1Str}T08:35:05.000Z`]
  );

  const recSarra = 'att-d1-4';
  await runQuery(
    `INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
     VALUES ($1, 'emp-004', $2, $3, $4, 'COMPLETED') ON CONFLICT (id) DO NOTHING;`,
    [recSarra, date1Str, `${date1Str}T07:59:00.000Z`, `${date1Str}T17:04:00.000Z`]
  );

  const recYoussef = 'att-d1-5';
  await runQuery(
    `INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
     VALUES ($1, 'emp-005', $2, $3, NULL, 'ANOMALY') ON CONFLICT (id) DO NOTHING;`,
    [recYoussef, date1Str, `${date1Str}T08:04:00.000Z`]
  );
  await runQuery(
    `INSERT INTO anomalies (id, employee_id, attendance_record_id, anomaly_type, severity, description, status, detected_at)
     VALUES ('anom-002', 'emp-005', $1, 'MISSING_CLOCK_OUT', 'HIGH', $2, 'OPEN', $3) ON CONFLICT (id) DO NOTHING;`,
    [recYoussef, 'Départ non enregistré : le pointage est resté ouvert au-delà du seuil de 12 heures', `${date1Str}T20:05:00.000Z`]
  );
}
