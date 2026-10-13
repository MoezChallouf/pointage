import { db } from './db.js';

// Rate Limiter for PIN verification to prevent brute-force attacks (10,000 combinations)
interface RateLimitEntry {
  failures: number;
  lockedUntil: number;
  lastAttempt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

export function checkPinRateLimit(clientIp: string): { allowed: boolean; remainingLockSeconds?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry) {
    return { allowed: true };
  }

  if (entry.lockedUntil > now) {
    const remaining = Math.ceil((entry.lockedUntil - now) / 1000);
    return { allowed: false, remainingLockSeconds: remaining };
  }

  // Reset if last attempt was > 5 minutes ago
  if (now - entry.lastAttempt > 5 * 60 * 1000) {
    rateLimitMap.delete(clientIp);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordPinFailure(clientIp: string): { locked: boolean; remainingLockSeconds?: number } {
  const now = Date.now();
  let entry = rateLimitMap.get(clientIp);

  if (!entry) {
    entry = { failures: 1, lockedUntil: 0, lastAttempt: now };
  } else {
    entry.failures += 1;
    entry.lastAttempt = now;
  }

  // If 5 or more failures, lock out for 60 seconds
  if (entry.failures >= 5) {
    entry.lockedUntil = now + 60 * 1000;
    entry.failures = 0; // reset for next batch
    rateLimitMap.set(clientIp, entry);
    return { locked: true, remainingLockSeconds: 60 };
  }

  rateLimitMap.set(clientIp, entry);
  return { locked: false };
}

export function recordPinSuccess(clientIp: string): void {
  rateLimitMap.delete(clientIp);
}

// Timezone helpers for Africa/Tunis
export function getTunisCurrentDateString(date: Date = new Date()): string {
  // Use Intl.DateTimeFormat to reliably get the date in Africa/Tunis
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Tunis',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // returns YYYY-MM-DD
}

export function getTunisCurrentTimeString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Tunis',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return formatter.format(date); // returns HH:MM:SS
}

export function getTunisHoursAndMinutes(date: Date): { hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Tunis',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  let hours = 0;
  let minutes = 0;
  for (const part of parts) {
    if (part.type === 'hour') hours = parseInt(part.value, 10);
    if (part.type === 'minute') minutes = parseInt(part.value, 10);
  }
  return { hours, minutes };
}

// Duration calculations
export function calculateDurationMinutes(
  clockInIso: string | null,
  clockOutIso: string | null,
  nowIso: string = new Date().toISOString()
): { grossMinutes: number; netMinutes: number } {
  if (!clockInIso) {
    return { grossMinutes: 0, netMinutes: 0 };
  }

  const startTime = new Date(clockInIso).getTime();
  const endTime = clockOutIso ? new Date(clockOutIso).getTime() : new Date(nowIso).getTime();

  if (isNaN(startTime) || isNaN(endTime) || endTime < startTime) {
    return { grossMinutes: 0, netMinutes: 0 };
  }

  const grossMinutes = Math.floor((endTime - startTime) / (60 * 1000));
  return { grossMinutes, netMinutes: grossMinutes };
}

export function formatDurationHuman(minutes: number): string {
  if (minutes <= 0) return '0 min';
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours === 0) return `${remainingMins} min`;
  return `${hours} h ${remainingMins.toString().padStart(2, '0')} min`;
}

// Anomaly checks
export interface CompanySettingsRow {
  id: number;
  company_name: string;
  timezone: string;
  expected_start_time: string;
  expected_end_time: string;
  late_grace_minutes: number;
  working_days: string;
  long_shift_hours: number;
  missing_clock_out_hours: number;
  break_tracking_enabled: number;
  unpaid_break_minutes: number;
  early_departure_enabled: number;
}

export function getCompanySettings(): CompanySettingsRow {
  const row = db.prepare('SELECT * FROM company_settings WHERE id = 1').get() as unknown as CompanySettingsRow;
  return row;
}

export function checkLateArrival(clockInIso: string, settings: CompanySettingsRow): { isLate: boolean; minutesLate: number } {
  const clockInDate = new Date(clockInIso);
  const { hours, minutes } = getTunisHoursAndMinutes(clockInDate);

  const [expHStr, expMStr] = settings.expected_start_time.split(':');
  const expH = parseInt(expHStr, 10);
  const expM = parseInt(expMStr, 10);

  const actualTotalMinutes = hours * 60 + minutes;
  const expectedTotalMinutes = expH * 60 + expM;
  const thresholdMinutes = expectedTotalMinutes + settings.late_grace_minutes;

  if (actualTotalMinutes > thresholdMinutes) {
    return {
      isLate: true,
      minutesLate: actualTotalMinutes - expectedTotalMinutes,
    };
  }

  return { isLate: false, minutesLate: 0 };
}

export function checkEarlyDeparture(clockOutIso: string, settings: CompanySettingsRow): { isEarly: boolean; minutesEarly: number } {
  if (!settings.early_departure_enabled) return { isEarly: false, minutesEarly: 0 };

  const clockOutDate = new Date(clockOutIso);
  const { hours, minutes } = getTunisHoursAndMinutes(clockOutDate);

  const [expHStr, expMStr] = settings.expected_end_time.split(':');
  const expH = parseInt(expHStr, 10);
  const expM = parseInt(expMStr, 10);

  const actualTotalMinutes = hours * 60 + minutes;
  const expectedTotalMinutes = expH * 60 + expM;

  if (actualTotalMinutes < expectedTotalMinutes) {
    return {
      isEarly: true,
      minutesEarly: expectedTotalMinutes - actualTotalMinutes,
    };
  }

  return { isEarly: false, minutesEarly: 0 };
}

// Background / on-demand anomaly scan
export function runAnomalyScan(): { detectedCount: number } {
  const settings = getCompanySettings();
  const now = new Date();
  let detectedCount = 0;

  // 1. Check for missing clock-outs (shifts opened > missing_clock_out_hours)
  const openRecords = db.prepare(`
    SELECT r.*, e.first_name, e.last_name 
    FROM attendance_records r
    JOIN employees e ON r.employee_id = e.id
    WHERE r.clock_out_at IS NULL AND r.clock_in_at IS NOT NULL
  `).all() as any[];

  for (const rec of openRecords) {
    const startMs = new Date(rec.clock_in_at).getTime();
    const elapsedHours = (now.getTime() - startMs) / (3600 * 1000);

    if (elapsedHours > settings.missing_clock_out_hours) {
      // Check if an anomaly already exists for this record
      const existing = db.prepare(`
        SELECT id FROM anomalies 
        WHERE attendance_record_id = ? AND anomaly_type = 'MISSING_CLOCK_OUT'
      `).get(rec.id);

      if (!existing) {
        const anomId = `anom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        db.prepare(`
          INSERT INTO anomalies (id, employee_id, attendance_record_id, anomaly_type, severity, description, status, detected_at)
          VALUES (?, ?, ?, 'MISSING_CLOCK_OUT', 'HIGH', ?, 'OPEN', datetime('now'))
        `).run(
          anomId,
          rec.employee_id,
          rec.id,
          `Départ non enregistré pour ${rec.first_name} ${rec.last_name} (${elapsedHours.toFixed(1)} h écoulées depuis l'arrivée)`
        );

        db.prepare(`
          UPDATE attendance_records SET status = 'ANOMALY', updated_at = datetime('now') WHERE id = ?
        `).run(rec.id);

        detectedCount++;
      }
    }
  }

  // 2. Check for long shifts (> long_shift_hours) on completed records
  const completedRecords = db.prepare(`
    SELECT r.*, e.first_name, e.last_name 
    FROM attendance_records r
    JOIN employees e ON r.employee_id = e.id
    WHERE r.clock_out_at IS NOT NULL AND r.clock_in_at IS NOT NULL
  `).all() as any[];

  for (const rec of completedRecords) {
    const startMs = new Date(rec.clock_in_at).getTime();
    const endMs = new Date(rec.clock_out_at).getTime();
    const shiftHours = (endMs - startMs) / (3600 * 1000);

    if (shiftHours > settings.long_shift_hours) {
      const existing = db.prepare(`
        SELECT id FROM anomalies 
        WHERE attendance_record_id = ? AND anomaly_type = 'LONG_SHIFT'
      `).get(rec.id);

      if (!existing) {
        const anomId = `anom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        db.prepare(`
          INSERT INTO anomalies (id, employee_id, attendance_record_id, anomaly_type, severity, description, status, detected_at)
          VALUES (?, ?, ?, 'LONG_SHIFT', 'MEDIUM', ?, 'OPEN', datetime('now'))
        `).run(
          anomId,
          rec.employee_id,
          rec.id,
          `Durée de service inhabituelle (${shiftHours.toFixed(1)} h) dépassant le seuil de ${settings.long_shift_hours} h`
        );
        detectedCount++;
      }
    }
  }

  return { detectedCount };
}
