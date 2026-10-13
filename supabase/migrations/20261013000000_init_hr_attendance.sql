-- ====================================================================
-- PointageRH Tunisie : Schéma PostgreSQL / Supabase
-- Migration : 20261013000000_init_hr_attendance.sql
-- Fuseau horaire applicatif : Africa/Tunis
--
-- Ce schéma reflète exactement le modèle attendu par le serveur Node
-- (server/routes.ts). L'accès se fait uniquement côté serveur via la
-- chaîne de connexion PostgreSQL (service role) : aucune donnée n'est
-- exposée directement au navigateur. Row Level Security est donc inutile.
-- ====================================================================

-- 1. PARAMÈTRES DE L'ENTREPRISE (ligne unique id = 1)
CREATE TABLE IF NOT EXISTS public.company_settings (
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
);

-- 2. ADMINISTRATEURS RH
CREATE TABLE IF NOT EXISTS public.admin_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. EMPLOYÉS
CREATE TABLE IF NOT EXISTS public.employees (
    id TEXT PRIMARY KEY,
    employee_number TEXT UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    pin_hash TEXT NOT NULL, -- Hachage bcrypt (jamais de PIN en clair)
    is_active INTEGER NOT NULL DEFAULT 1,
    department TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. FICHES DE POINTAGE
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,           -- Date locale Tunis : YYYY-MM-DD
    clock_in_at TIMESTAMPTZ,      -- Horodatage ISO UTC
    clock_out_at TIMESTAMPTZ,     -- NULL si le service est en cours
    break_minutes INTEGER NOT NULL DEFAULT 0,
    break_started_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS', -- IN_PROGRESS | COMPLETED | ANOMALY
    is_corrected INTEGER NOT NULL DEFAULT 0,
    correction_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un employé ne peut avoir qu'un seul shift ouvert à la fois
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_shift
    ON public.attendance_records (employee_id)
    WHERE clock_out_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_employee_date
    ON public.attendance_records (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_date
    ON public.attendance_records (date);

-- 5. ÉVÉNEMENTS DE POINTAGE (journal append-only)
CREATE TABLE IF NOT EXISTS public.attendance_events (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    attendance_record_id TEXT REFERENCES public.attendance_records(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- CLOCK_IN | CLOCK_OUT | START_BREAK | END_BREAK | MANUAL_CORRECTION
    event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL DEFAULT 'SYSTEM',
    metadata TEXT
);

-- 6. ANOMALIES
CREATE TABLE IF NOT EXISTS public.anomalies (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    attendance_record_id TEXT REFERENCES public.attendance_records(id) ON DELETE SET NULL,
    anomaly_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'MEDIUM',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | IN_REVIEW | RESOLVED | DISMISSED
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_status ON public.anomalies (status);
CREATE INDEX IF NOT EXISTS idx_anomalies_employee ON public.anomalies (employee_id);

-- 7. JOURNAL D'AUDIT ADMINISTRATEUR (append-only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    administrator_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- Les paramètres et les comptes de démonstration sont créés automatiquement
-- au premier démarrage du serveur (server/db.ts -> seedDatabase()).
