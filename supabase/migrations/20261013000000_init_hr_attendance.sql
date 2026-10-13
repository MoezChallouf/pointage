-- ====================================================================
-- PointageRH Tunisie: Schéma Supabase & Politiques RLS PostgreSQL
-- Migration: 20261013000000_init_hr_attendance.sql
-- Fuseau horaire : Africa/Tunis
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. PARAMÈTRES DE L'ENTREPRISE
CREATE TABLE IF NOT EXISTS public.company_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    company_name TEXT NOT NULL DEFAULT 'Société Tunisienne de Services',
    timezone TEXT NOT NULL DEFAULT 'Africa/Tunis',
    expected_start_time TIME NOT NULL DEFAULT '08:00:00',
    expected_end_time TIME NOT NULL DEFAULT '17:00:00',
    late_grace_minutes INT NOT NULL DEFAULT 15,
    working_days JSONB NOT NULL DEFAULT '[1, 2, 3, 4, 5]'::jsonb, -- 1=Lundi à 5=Vendredi
    long_shift_hours NUMERIC(4, 1) NOT NULL DEFAULT 10.0,
    missing_clock_out_hours NUMERIC(4, 1) NOT NULL DEFAULT 12.0,
    break_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    unpaid_break_minutes INT NOT NULL DEFAULT 60,
    early_departure_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. EMPLOYÉS
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_number VARCHAR(50) UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    pin_hash TEXT NOT NULL, -- Hachage sécurisé bcrypt/argon2id (jamais de PIN en clair)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    department VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. FICHES DE POINTAGE (ATTENDANCE RECORDS)
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    date DATE NOT NULL, -- Date locale en Tunisie (YYYY-MM-DD)
    clock_in_at TIMESTAMPTZ, -- Horodatage UTC officiel du serveur
    clock_out_at TIMESTAMPTZ, -- Null si le service est en cours
    break_minutes INT NOT NULL DEFAULT 0,
    break_started_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'COMPLETED', 'ANOMALY'
    is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
    correction_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Empêche formellement un employé d'avoir deux pointages ouverts en parallèle
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_shift_per_employee
ON public.attendance_records (employee_id)
WHERE clock_out_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_date
ON public.attendance_records (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_records_date
ON public.attendance_records (date);

-- 5. ÉVÉNEMENTS D'AUDIT DE POINTAGE (JOURNALISATION APPEND-ONLY)
CREATE TABLE IF NOT EXISTS public.attendance_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    attendance_record_id UUID REFERENCES public.attendance_records(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- 'CLOCK_IN', 'CLOCK_OUT', 'START_BREAK', 'END_BREAK', 'MANUAL_CORRECTION'
    event_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 6. ANOMALIES
CREATE TABLE IF NOT EXISTS public.anomalies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    attendance_record_id UUID REFERENCES public.attendance_records(id) ON DELETE SET NULL,
    anomaly_type VARCHAR(50) NOT NULL, -- 'MISSING_CLOCK_IN', 'MISSING_CLOCK_OUT', 'LATE_ARRIVAL', 'EARLY_DEPARTURE', 'LONG_SHIFT', 'CONFLICTING_SHIFT', 'MISSING_ATTENDANCE'
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH'
    description TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'
    detected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_anomalies_status ON public.anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomalies_employee ON public.anomalies(employee_id);

-- 7. AUDIT LOGS (JOURNAL DES ACTIONS ADMINISTRATEUR)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    administrator_id TEXT NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ====================================================================
-- POLITIQUES DE SÉCURITÉ ROW LEVEL SECURITY (RLS)
-- ====================================================================

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Les administrateurs authentifiés ont un accès complet
CREATE POLICY "Admins full access to company_settings" ON public.company_settings
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins full access to employees" ON public.employees
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins full access to attendance_records" ON public.attendance_records
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins full access to attendance_events" ON public.attendance_events
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins full access to anomalies" ON public.anomalies
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins view audit_logs" ON public.audit_logs
    FOR SELECT TO authenticated USING (true);

-- Aucun utilisateur ne peut modifier ou supprimer l'historique d'audit (Append-Only)
CREATE POLICY "No one updates audit_logs" ON public.audit_logs
    FOR UPDATE USING (false);
CREATE POLICY "No one deletes audit_logs" ON public.audit_logs
    FOR DELETE USING (false);

-- ====================================================================
-- DONNÉES DE DÉPART (5 EMPLOYÉS EN TUNISIE)
-- ====================================================================
INSERT INTO public.company_settings (id, company_name, timezone, expected_start_time, expected_end_time)
VALUES (1, 'Société Tunisienne de Services', 'Africa/Tunis', '08:00:00', '17:00:00')
ON CONFLICT (id) DO NOTHING;
