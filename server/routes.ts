import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db.js';
import {
  checkPinRateLimit,
  recordPinFailure,
  recordPinSuccess,
  getTunisCurrentDateString,
  getTunisCurrentTimeString,
  calculateDurationMinutes,
  formatDurationHuman,
  getCompanySettings,
  checkLateArrival,
  checkEarlyDeparture,
  runAnomalyScan,
} from './attendance-logic.js';

export const apiRouter = Router();

// In-memory admin session storage (tokens valid for 24h)
const adminSessions = new Map<string, { adminId: string; email: string; name: string; expiresAt: number }>();

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Authentication middleware for administrative endpoints
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Accès non autorisé. Veuillez vous connecter en tant qu\'administrateur.' });
  }

  const token = authHeader.split(' ')[1];
  const session = adminSessions.get(token);

  if (!session || session.expiresAt < Date.now()) {
    if (session) adminSessions.delete(token);
    return res.status(401).json({ error: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
  }

  (req as any).admin = session;
  next();
}

// ==========================================
// 1. EMPLOYEE KIOSK ENDPOINTS
// ==========================================

// Get current Tunisian date & time from server
apiRouter.get('/kiosk/time', (req, res) => {
  const now = new Date();
  const dateStr = getTunisCurrentDateString(now);
  const timeStr = getTunisCurrentTimeString(now);

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Tunis',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const dateFormatted = formatter.format(now);
  // Capitalize first letter of day
  const dateCapitalized = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);

  res.json({
    iso: now.toISOString(),
    localDate: dateStr,
    localTime: timeStr,
    formattedDate: dateCapitalized,
    timezone: 'Africa/Tunis',
  });
});

// Helper to authenticate employee by PIN with rate limiting
function verifyEmployeePin(pin: string, clientIp: string) {
  const rateLimit = checkPinRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return {
      error: `Trop de tentatives erronées. Veuillez patienter ${rateLimit.remainingLockSeconds} secondes avant de réessayer.`,
      status: 429,
    };
  }

  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return { error: 'Le code PIN doit comporter exactement 4 chiffres.', status: 400 };
  }

  // Fetch all active employees to verify PIN in constant-ish time without leaking which PIN belongs to whom
  const employees = db.prepare('SELECT * FROM employees WHERE is_active = 1').all() as any[];

  let matchedEmployee: any = null;
  for (const emp of employees) {
    if (bcrypt.compareSync(pin, emp.pin_hash)) {
      matchedEmployee = emp;
      break;
    }
  }

  if (!matchedEmployee) {
    const lockInfo = recordPinFailure(clientIp);
    if (lockInfo.locked) {
      return {
        error: `Code PIN incorrect. Clavier verrouillé pour 60 secondes suite à plusieurs tentatives erronées.`,
        status: 429,
      };
    }
    return { error: 'Code PIN non reconnu ou employé inactif. Veuillez vérifier votre saisie.', status: 401 };
  }

  recordPinSuccess(clientIp);
  return { employee: matchedEmployee };
}

// Check PIN & active shift status without performing an action
apiRouter.post('/kiosk/status', (req, res) => {
  const { pin } = req.body;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  const verification = verifyEmployeePin(pin, clientIp);
  if ('error' in verification) {
    return res.status(verification.status!).json({ error: verification.error });
  }

  const employee = verification.employee;
  const openShift = db.prepare(`
    SELECT * FROM attendance_records 
    WHERE employee_id = ? AND clock_out_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(employee.id) as any;

  res.json({
    employeeName: employee.first_name,
    employeeFullName: `${employee.first_name} ${employee.last_name}`,
    department: employee.department,
    hasOpenShift: !!openShift,
    shift: openShift || null,
  });
});

// START SHIFT (Clock-in)
apiRouter.post('/kiosk/clock-in', (req, res) => {
  const { pin } = req.body;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  const verification = verifyEmployeePin(pin, clientIp);
  if ('error' in verification) {
    return res.status(verification.status!).json({ error: verification.error });
  }

  const employee = verification.employee;
  const now = new Date();
  const nowIso = now.toISOString();
  const tunisDate = getTunisCurrentDateString(now);
  const tunisTime = getTunisCurrentTimeString(now).substring(0, 5); // HH:MM

  // Check if an open shift already exists
  const openShift = db.prepare(`
    SELECT * FROM attendance_records 
    WHERE employee_id = ? AND clock_out_at IS NULL
  `).get(employee.id) as any;

  if (openShift) {
    const shiftTime = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Tunis',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(openShift.clock_in_at));

    return res.status(400).json({
      error: `Votre service est déjà en cours (commencé aujourd'hui à ${shiftTime}). Veuillez pointer votre fin de service lorsque vous aurez terminé.`,
      openShift,
    });
  }

  // Create new attendance record
  const recordId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const settings = getCompanySettings();

  // Check late arrival
  const lateCheck = checkLateArrival(nowIso, settings);
  const initialStatus = lateCheck.isLate ? 'ANOMALY' : 'IN_PROGRESS';

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      INSERT INTO attendance_records (id, employee_id, date, clock_in_at, clock_out_at, status)
      VALUES (?, ?, ?, ?, NULL, ?)
    `).run(recordId, employee.id, tunisDate, nowIso, initialStatus);

    db.prepare(`
      INSERT INTO attendance_events (id, employee_id, attendance_record_id, event_type, event_at, created_by)
      VALUES (?, ?, ?, 'CLOCK_IN', ?, 'KIOSK')
    `).run(`evt-${Date.now()}-in`, employee.id, recordId, nowIso);

    // If late, insert anomaly record
    if (lateCheck.isLate) {
      const anomId = `anom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO anomalies (id, employee_id, attendance_record_id, anomaly_type, severity, description, status, detected_at)
        VALUES (?, ?, ?, 'LATE_ARRIVAL', 'LOW', ?, 'OPEN', datetime('now'))
      `).run(
        anomId,
        employee.id,
        recordId,
        `Arrivée tardive à ${tunisTime} (${lateCheck.minutesLate} minutes de retard par rapport à l'horaire prévu ${settings.expected_start_time})`
      );
    }

    db.exec('COMMIT;');
  } catch (err: any) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement du pointage. Veuillez réessayer.' });
  }

  res.json({
    success: true,
    action: 'CLOCK_IN',
    recordId,
    employeeId: employee.id,
    firstName: employee.first_name,
    clockInAt: nowIso,
    clockInTimeFormatted: tunisTime,
    message: `Bonjour ${employee.first_name}, votre service a commencé à ${tunisTime}.`,
    isLate: lateCheck.isLate,
  });
});

// END SHIFT (Clock-out)
apiRouter.post('/kiosk/clock-out', (req, res) => {
  const { pin } = req.body;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  const verification = verifyEmployeePin(pin, clientIp);
  if ('error' in verification) {
    return res.status(verification.status!).json({ error: verification.error });
  }

  const employee = verification.employee;
  const now = new Date();
  const nowIso = now.toISOString();
  const tunisTime = getTunisCurrentTimeString(now).substring(0, 5); // HH:MM

  // Check for open shift
  const openShift = db.prepare(`
    SELECT * FROM attendance_records 
    WHERE employee_id = ? AND clock_out_at IS NULL
  `).get(employee.id) as any;

  if (!openShift) {
    return res.status(400).json({
      error: `Aucun service en cours n'a été trouvé pour ${employee.first_name}. Vous devez d'abord pointer votre début de service.`,
    });
  }

  // Calculate duration
  const { grossMinutes } = calculateDurationMinutes(openShift.clock_in_at, nowIso);
  const formattedDuration = formatDurationHuman(grossMinutes);

  const startTimeFormatted = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Tunis',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(openShift.clock_in_at));

  const settings = getCompanySettings();
  const earlyCheck = checkEarlyDeparture(nowIso, settings);
  const newStatus = openShift.status === 'ANOMALY' || earlyCheck.isEarly ? 'ANOMALY' : 'COMPLETED';

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      UPDATE attendance_records 
      SET clock_out_at = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nowIso, newStatus, openShift.id);

    db.prepare(`
      INSERT INTO attendance_events (id, employee_id, attendance_record_id, event_type, event_at, created_by)
      VALUES (?, ?, ?, 'CLOCK_OUT', ?, 'KIOSK')
    `).run(`evt-${Date.now()}-out`, employee.id, openShift.id, nowIso);

    if (earlyCheck.isEarly) {
      const anomId = `anom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO anomalies (id, employee_id, attendance_record_id, anomaly_type, severity, description, status, detected_at)
        VALUES (?, ?, ?, 'EARLY_DEPARTURE', 'LOW', ?, 'OPEN', datetime('now'))
      `).run(
        anomId,
        employee.id,
        openShift.id,
        `Départ anticipé à ${tunisTime} (${earlyCheck.minutesEarly} min avant la fin prévue ${settings.expected_end_time})`
      );
    }

    db.exec('COMMIT;');
  } catch (err: any) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la fin de service.' });
  }

  res.json({
    success: true,
    action: 'CLOCK_OUT',
    recordId: openShift.id,
    firstName: employee.first_name,
    startTimeFormatted,
    endTimeFormatted: tunisTime,
    durationMinutes: grossMinutes,
    durationFormatted: formattedDuration,
    message: `Fin de service enregistrée à ${tunisTime}. Temps travaillé : ${formattedDuration}.`,
  });
});

// ==========================================
// 2. ADMIN AUTHENTICATION
// ==========================================

apiRouter.post('/admin/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Veuillez saisir votre adresse e-mail et votre mot de passe.' });
  }

  const admin = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email.toLowerCase().trim()) as any;

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Identifiants administrateur incorrects.' });
  }

  const token = generateToken();
  const expiresAt = Date.now() + 24 * 3600 * 1000; // 24 hours

  adminSessions.set(token, {
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    expiresAt,
  });

  res.json({
    success: true,
    token,
    user: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  });
});

apiRouter.post('/admin/logout', requireAdminAuth, (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) adminSessions.delete(token);
  res.json({ success: true });
});

apiRouter.get('/admin/me', requireAdminAuth, (req, res) => {
  const adminSession = (req as any).admin;
  res.json({
    user: {
      id: adminSession.adminId,
      email: adminSession.email,
      name: adminSession.name,
    },
  });
});

// ==========================================
// 3. ADMIN DASHBOARD & ATTENDANCE
// ==========================================

apiRouter.get('/admin/dashboard', requireAdminAuth, (req, res) => {
  // Run passive anomaly scan on open records
  runAnomalyScan();

  const requestedDate = (req.query.date as string) || getTunisCurrentDateString();

  // 1. Total active employees
  const totalEmployees = (db.prepare('SELECT COUNT(*) as count FROM employees WHERE is_active = 1').get() as any).count;

  // 2. All active employees
  const employees = db.prepare(`
    SELECT id, employee_number, first_name, last_name, department, is_active
    FROM employees 
    WHERE is_active = 1
    ORDER BY employee_number ASC, first_name ASC
  `).all() as any[];

  // 3. Attendance records for selected date
  const records = db.prepare(`
    SELECT r.*, e.first_name, e.last_name, e.employee_number, e.department
    FROM attendance_records r
    JOIN employees e ON r.employee_id = e.id
    WHERE r.date = ?
  `).all(requestedDate) as any[];

  // 4. Unresolved anomalies count
  const openAnomaliesCount = (db.prepare(`
    SELECT COUNT(*) as count FROM anomalies WHERE status IN ('OPEN', 'IN_REVIEW')
  `).get() as any).count;

  // Compute stats and per-employee statuses
  let currentlyWorking = 0;
  let completedToday = 0;
  let totalMinutesWorkedToday = 0;

  const nowIso = new Date().toISOString();

  const employeeStatusList = employees.map((emp) => {
    // Find attendance records for this employee on this date
    const empRecords = records.filter((r) => r.employee_id === emp.id);
    const primaryRecord = empRecords[0] || null;

    let status = 'Non pointé';
    let clockInFormatted: string | null = null;
    let clockOutFormatted: string | null = null;
    let durationFormatted: string | null = null;
    let durationMinutes = 0;
    let hasAnomaly = false;

    if (primaryRecord) {
      if (primaryRecord.clock_in_at) {
        clockInFormatted = new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'Africa/Tunis',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(primaryRecord.clock_in_at));
      }

      if (primaryRecord.clock_out_at) {
        clockOutFormatted = new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'Africa/Tunis',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(primaryRecord.clock_out_at));
      }

      const dur = calculateDurationMinutes(primaryRecord.clock_in_at, primaryRecord.clock_out_at, nowIso);
      durationMinutes = dur.grossMinutes;
      durationFormatted = formatDurationHuman(durationMinutes);
      totalMinutesWorkedToday += durationMinutes;

      // Check if there are anomalies linked to this record
      const anomCount = (db.prepare(`
        SELECT COUNT(*) as count FROM anomalies 
        WHERE attendance_record_id = ? AND status IN ('OPEN', 'IN_REVIEW')
      `).get(primaryRecord.id) as any).count;

      hasAnomaly = anomCount > 0;

      if (hasAnomaly) {
        status = 'Anomalie à vérifier';
      } else if (primaryRecord.clock_out_at) {
        status = 'Service terminé';
        completedToday++;
      } else {
        status = 'En service';
        currentlyWorking++;
      }
    } else {
      // Check if it's a weekday in the past (absence à vérifier)
      const isPastDate = requestedDate < getTunisCurrentDateString();
      if (isPastDate) {
        status = 'Absence à vérifier';
      }
    }

    return {
      employeeId: emp.id,
      employeeNumber: emp.employee_number,
      fullName: `${emp.first_name} ${emp.last_name}`,
      department: emp.department,
      status,
      recordId: primaryRecord?.id || null,
      clockInAt: primaryRecord?.clock_in_at || null,
      clockInFormatted,
      clockOutAt: primaryRecord?.clock_out_at || null,
      clockOutFormatted,
      durationFormatted,
      durationMinutes,
      hasAnomaly,
    };
  });

  const notClockedInToday = totalEmployees - currentlyWorking - completedToday;

  res.json({
    date: requestedDate,
    stats: {
      totalEmployees,
      currentlyWorking,
      completedToday,
      notClockedInToday: Math.max(0, notClockedInToday),
      openAnomaliesCount,
      totalMinutesWorkedToday,
      totalHoursFormatted: formatDurationHuman(totalMinutesWorkedToday),
    },
    employeeStatuses: employeeStatusList,
  });
});

// Full attendance history with filtering & pagination
apiRouter.get('/admin/attendance', requireAdminAuth, (req, res) => {
  const {
    employee_id,
    start_date,
    end_date,
    date,
    status,
    has_anomaly,
    sort_by = 'date',
    sort_order = 'DESC',
    page = '1',
    limit = '20',
  } = req.query;

  let query = `
    SELECT r.*, e.first_name, e.last_name, e.employee_number, e.department,
      (SELECT COUNT(*) FROM anomalies a WHERE a.attendance_record_id = r.id AND a.status IN ('OPEN', 'IN_REVIEW')) as active_anomaly_count,
      (SELECT GROUP_CONCAT(a.anomaly_type) FROM anomalies a WHERE a.attendance_record_id = r.id) as anomaly_types
    FROM attendance_records r
    JOIN employees e ON r.employee_id = e.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (employee_id) {
    query += ' AND r.employee_id = ?';
    params.push(employee_id);
  }
  if (date) {
    query += ' AND r.date = ?';
    params.push(date);
  }
  if (start_date) {
    query += ' AND r.date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND r.date <= ?';
    params.push(end_date);
  }
  if (status) {
    query += ' AND r.status = ?';
    params.push(status);
  }
  if (has_anomaly === 'true') {
    query += ' AND (SELECT COUNT(*) FROM anomalies a WHERE a.attendance_record_id = r.id) > 0';
  }

  // Count total matching
  const countQuery = `SELECT COUNT(*) as count FROM (${query})`;
  const totalCount = (db.prepare(countQuery).get(...params) as any).count;

  // Sorting
  const allowedSortCols: Record<string, string> = {
    date: 'r.date',
    name: 'e.last_name',
    start_time: 'r.clock_in_at',
    status: 'r.status',
  };
  const sortCol = allowedSortCols[sort_by as string] || 'r.date';
  const order = sort_order === 'ASC' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${sortCol} ${order}, r.created_at DESC`;

  // Pagination
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
  const offset = (pageNum - 1) * pageSize;

  query += ' LIMIT ? OFFSET ?';
  params.push(pageSize, offset);

  const rows = db.prepare(query).all(...params) as any[];

  const formattedRows = rows.map((r) => {
    const dur = calculateDurationMinutes(r.clock_in_at, r.clock_out_at);
    return {
      id: r.id,
      employeeId: r.employee_id,
      employeeNumber: r.employee_number,
      employeeName: `${r.first_name} ${r.last_name}`,
      department: r.department,
      date: r.date,
      clockInAt: r.clock_in_at,
      clockOutAt: r.clock_out_at,
      breakMinutes: r.break_minutes,
      grossMinutes: dur.grossMinutes,
      netMinutes: Math.max(0, dur.grossMinutes - (r.break_minutes || 0)),
      durationFormatted: formatDurationHuman(dur.grossMinutes),
      status: r.status,
      isCorrected: !!r.is_corrected,
      correctionReason: r.correction_reason,
      activeAnomalyCount: r.active_anomaly_count || 0,
      anomalyTypes: r.anomaly_types ? r.anomaly_types.split(',') : [],
      updatedAt: r.updated_at,
    };
  });

  res.json({
    data: formattedRows,
    pagination: {
      total: totalCount,
      page: pageNum,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  });
});

// Single attendance record detail with events and audit logs
apiRouter.get('/admin/attendance/:id', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const record = db.prepare(`
    SELECT r.*, e.first_name, e.last_name, e.employee_number, e.department
    FROM attendance_records r
    JOIN employees e ON r.employee_id = e.id
    WHERE r.id = ?
  `).get(id) as any;

  if (!record) {
    return res.status(404).json({ error: 'Fiche de pointage introuvable.' });
  }

  const events = db.prepare(`
    SELECT * FROM attendance_events 
    WHERE attendance_record_id = ?
    ORDER BY event_at ASC
  `).all(id);

  const anomalies = db.prepare(`
    SELECT * FROM anomalies 
    WHERE attendance_record_id = ?
    ORDER BY detected_at DESC
  `).all(id);

  const auditLogs = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE entity_id = ? AND entity_type = 'ATTENDANCE_RECORD'
    ORDER BY created_at DESC
  `).all(id);

  const dur = calculateDurationMinutes(record.clock_in_at, record.clock_out_at);

  res.json({
    record: {
      ...record,
      grossMinutes: dur.grossMinutes,
      durationFormatted: formatDurationHuman(dur.grossMinutes),
    },
    events,
    anomalies,
    auditLogs: auditLogs.map((log: any) => ({
      ...log,
      oldValues: log.old_values ? JSON.parse(log.old_values) : null,
      newValues: log.new_values ? JSON.parse(log.new_values) : null,
    })),
  });
});

// MANUAL CORRECTION of start time, end time, and break
apiRouter.put('/admin/attendance/:id/correct', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const { clock_in_at, clock_out_at, reason, break_minutes = 0 } = req.body;
  const admin = (req as any).admin;

  if (!reason || typeof reason !== 'string' || reason.trim().length < 4) {
    return res.status(400).json({ error: 'Le motif de correction est obligatoire (minimum 4 caractères).' });
  }

  const existing = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Fiche de pointage introuvable.' });
  }

  // Validate timestamps
  if (clock_in_at && clock_out_at) {
    const startMs = new Date(clock_in_at).getTime();
    const endMs = new Date(clock_out_at).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      return res.status(400).json({ error: 'Format de date ou d\'heure invalide.' });
    }

    if (endMs <= startMs) {
      return res.status(400).json({ error: 'L\'heure de fin de service doit être postérieure à l\'heure de début.' });
    }
  }

  const oldValues = {
    clock_in_at: existing.clock_in_at,
    clock_out_at: existing.clock_out_at,
    break_minutes: existing.break_minutes,
    status: existing.status,
  };

  const newValues = {
    clock_in_at: clock_in_at || existing.clock_in_at,
    clock_out_at: clock_out_at || existing.clock_out_at,
    break_minutes: parseInt(break_minutes, 10) || 0,
    status: clock_out_at ? 'COMPLETED' : 'IN_PROGRESS',
  };

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Update record
    db.prepare(`
      UPDATE attendance_records
      SET clock_in_at = ?, clock_out_at = ?, break_minutes = ?, status = ?,
          is_corrected = 1, correction_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newValues.clock_in_at, newValues.clock_out_at, newValues.break_minutes, newValues.status, reason.trim(), id);

    // 2. Append immutable audit log
    const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO audit_logs (id, administrator_id, action, entity_type, entity_id, old_values, new_values, reason)
      VALUES (?, ?, 'MANUAL_CORRECTION', 'ATTENDANCE_RECORD', ?, ?, ?, ?)
    `).run(
      auditId,
      admin.adminId,
      id,
      JSON.stringify(oldValues),
      JSON.stringify(newValues),
      reason.trim()
    );

    // 3. Record event
    db.prepare(`
      INSERT INTO attendance_events (id, employee_id, attendance_record_id, event_type, event_at, created_by, metadata)
      VALUES (?, ?, ?, 'MANUAL_CORRECTION', datetime('now'), ?, ?)
    `).run(
      `evt-corr-${Date.now()}`,
      existing.employee_id,
      id,
      admin.name,
      JSON.stringify({ reason: reason.trim() })
    );

    // 4. If missing clock-out anomaly existed and we now supplied a clock-out, auto-resolve it
    if (newValues.clock_out_at) {
      db.prepare(`
        UPDATE anomalies 
        SET status = 'RESOLVED', resolved_at = datetime('now'), resolved_by = ?,
            resolution_notes = 'Résolue automatiquement suite à la correction de l''heure de départ',
            updated_at = datetime('now')
        WHERE attendance_record_id = ? AND anomaly_type = 'MISSING_CLOCK_OUT' AND status IN ('OPEN', 'IN_REVIEW')
      `).run(admin.name, id);
    }

    db.exec('COMMIT;');
  } catch (err: any) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la correction : ' + err.message });
  }

  res.json({ success: true, message: 'Correction enregistrée avec succès.' });
});

// ==========================================
// 4. EMPLOYEE MANAGEMENT
// ==========================================

apiRouter.get('/admin/employees', requireAdminAuth, (req, res) => {
  const employees = db.prepare(`
    SELECT e.id, e.employee_number, e.first_name, e.last_name, e.is_active, 
           e.department, e.notes, e.created_at, e.updated_at,
           (SELECT COUNT(*) FROM attendance_records r WHERE r.employee_id = e.id) as total_shifts,
           (SELECT r.id FROM attendance_records r WHERE r.employee_id = e.id AND r.clock_out_at IS NULL LIMIT 1) as open_shift_id
    FROM employees e
    ORDER BY e.employee_number ASC, e.first_name ASC
  `).all();

  res.json({ data: employees });
});

apiRouter.post('/admin/employees', requireAdminAuth, (req, res) => {
  const { employee_number, first_name, last_name, pin, department, notes } = req.body;
  const admin = (req as any).admin;

  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'Le prénom et le nom sont obligatoires.' });
  }

  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'Le code PIN doit comporter exactement 4 chiffres numériques.' });
  }

  // Check PIN duplicate
  const allEmployees = db.prepare('SELECT id, pin_hash FROM employees').all() as any[];
  for (const emp of allEmployees) {
    if (bcrypt.compareSync(pin, emp.pin_hash)) {
      return res.status(400).json({ error: 'Ce code PIN est déjà attribué à un autre employé. Veuillez en choisir un autre.' });
    }
  }

  const id = `emp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const pinHash = bcrypt.hashSync(pin, 10);

  db.prepare(`
    INSERT INTO employees (id, employee_number, first_name, last_name, pin_hash, is_active, department, notes)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, employee_number || null, first_name.trim(), last_name.trim(), pinHash, department || null, notes || null);

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, administrator_id, action, entity_type, entity_id, new_values, reason)
    VALUES (?, ?, 'CREATE_EMPLOYEE', 'EMPLOYEE', ?, ?, 'Création d\'un nouvel employé')
  `).run(
    `aud-${Date.now()}`,
    admin.adminId,
    id,
    JSON.stringify({ first_name, last_name, employee_number, department })
  );

  res.json({ success: true, message: 'Employé créé avec succès.', id });
});

apiRouter.put('/admin/employees/:id', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const { employee_number, first_name, last_name, is_active, department, notes, pin } = req.body;
  const admin = (req as any).admin;

  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as any;
  if (!employee) {
    return res.status(404).json({ error: 'Employé introuvable.' });
  }

  let newPinHash = employee.pin_hash;
  if (pin) {
    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'Le code PIN doit comporter exactement 4 chiffres.' });
    }

    // Check duplicate against others
    const otherEmployees = db.prepare('SELECT id, pin_hash FROM employees WHERE id != ?').all(id) as any[];
    for (const other of otherEmployees) {
      if (bcrypt.compareSync(pin, other.pin_hash)) {
        return res.status(400).json({ error: 'Ce code PIN est déjà utilisé par un autre employé.' });
      }
    }
    newPinHash = bcrypt.hashSync(pin, 10);
  }

  db.prepare(`
    UPDATE employees 
    SET employee_number = ?, first_name = ?, last_name = ?, is_active = ?,
        department = ?, notes = ?, pin_hash = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    employee_number || null,
    first_name?.trim() || employee.first_name,
    last_name?.trim() || employee.last_name,
    is_active !== undefined ? (is_active ? 1 : 0) : employee.is_active,
    department !== undefined ? department : employee.department,
    notes !== undefined ? notes : employee.notes,
    newPinHash,
    id
  );

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, administrator_id, action, entity_type, entity_id, old_values, new_values, reason)
    VALUES (?, ?, 'UPDATE_EMPLOYEE', 'EMPLOYEE', ?, ?, ?, 'Mise à jour des informations de l\'employé')
  `).run(
    `aud-${Date.now()}`,
    admin.adminId,
    id,
    JSON.stringify({ first_name: employee.first_name, is_active: employee.is_active }),
    JSON.stringify({ first_name, is_active })
  );

  res.json({ success: true, message: 'Fiche employé mise à jour avec succès.' });
});

// ==========================================
// 5. ANOMALY MANAGEMENT
// ==========================================

apiRouter.get('/admin/anomalies', requireAdminAuth, (req, res) => {
  const { status, employee_id, anomaly_type } = req.query;

  let query = `
    SELECT a.*, e.first_name, e.last_name, e.employee_number,
           r.date as attendance_date, r.clock_in_at, r.clock_out_at
    FROM anomalies a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN attendance_records r ON a.attendance_record_id = r.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (status && status !== 'ALL') {
    query += ' AND a.status = ?';
    params.push(status);
  }
  if (employee_id) {
    query += ' AND a.employee_id = ?';
    params.push(employee_id);
  }
  if (anomaly_type) {
    query += ' AND a.anomaly_type = ?';
    params.push(anomaly_type);
  }

  query += ' ORDER BY a.detected_at DESC';
  const anomalies = db.prepare(query).all(...params);

  res.json({ data: anomalies });
});

apiRouter.put('/admin/anomalies/:id/resolve', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const { status, resolution_notes } = req.body; // 'RESOLVED', 'DISMISSED', 'IN_REVIEW', 'OPEN'
  const admin = (req as any).admin;

  if (!status || !['RESOLVED', 'DISMISSED', 'IN_REVIEW', 'OPEN'].includes(status)) {
    return res.status(400).json({ error: 'Statut d\'anomalie invalide.' });
  }

  const existing = db.prepare('SELECT * FROM anomalies WHERE id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Anomalie introuvable.' });
  }

  const resolvedAt = ['RESOLVED', 'DISMISSED'].includes(status) ? new Date().toISOString() : null;

  db.prepare(`
    UPDATE anomalies 
    SET status = ?, resolution_notes = ?, resolved_by = ?, resolved_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, resolution_notes || null, admin.name, resolvedAt, id);

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, administrator_id, action, entity_type, entity_id, old_values, new_values, reason)
    VALUES (?, ?, 'RESOLVE_ANOMALY', 'ANOMALY', ?, ?, ?, ?)
  `).run(
    `aud-${Date.now()}`,
    admin.adminId,
    id,
    JSON.stringify({ status: existing.status }),
    JSON.stringify({ status, resolution_notes }),
    resolution_notes || 'Résolution d\'anomalie'
  );

  res.json({ success: true, message: `Anomalie marquée comme ${status}.` });
});

apiRouter.post('/admin/anomalies/run-check', requireAdminAuth, (req, res) => {
  const result = runAnomalyScan();
  res.json({ success: true, message: `Analyse terminée. ${result.detectedCount} nouvelle(s) anomalie(s) détectée(s).` });
});

// ==========================================
// 6. REPORTS & CSV EXPORT
// ==========================================

apiRouter.get('/admin/reports/summary', requireAdminAuth, (req, res) => {
  const { start_date, end_date, employee_id } = req.query;

  let filter = 'WHERE 1=1';
  const params: any[] = [];

  if (start_date) {
    filter += ' AND r.date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    filter += ' AND r.date <= ?';
    params.push(end_date);
  }
  if (employee_id) {
    filter += ' AND r.employee_id = ?';
    params.push(employee_id);
  }

  const records = db.prepare(`
    SELECT r.*, e.first_name, e.last_name, e.employee_number
    FROM attendance_records r
    JOIN employees e ON r.employee_id = e.id
    ${filter}
  `).all(...params) as any[];

  let totalShifts = records.length;
  let completedShifts = 0;
  let openShifts = 0;
  let totalGrossMinutes = 0;

  for (const r of records) {
    if (r.clock_out_at) {
      completedShifts++;
      const dur = calculateDurationMinutes(r.clock_in_at, r.clock_out_at);
      totalGrossMinutes += dur.grossMinutes;
    } else {
      openShifts++;
    }
  }

  // Anomalies in range
  const anomaliesCount = (db.prepare(`
    SELECT COUNT(*) as count FROM anomalies a
    JOIN attendance_records r ON a.attendance_record_id = r.id
    ${filter}
  `).get(...params) as any)?.count || 0;

  res.json({
    totalShifts,
    completedShifts,
    openShifts,
    totalGrossMinutes,
    totalGrossFormatted: formatDurationHuman(totalGrossMinutes),
    anomaliesCount,
  });
});

apiRouter.get('/admin/reports/export-csv', requireAdminAuth, (req, res) => {
  const { start_date, end_date, employee_id } = req.query;

  let filter = 'WHERE 1=1';
  const params: any[] = [];

  if (start_date) {
    filter += ' AND r.date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    filter += ' AND r.date <= ?';
    params.push(end_date);
  }
  if (employee_id) {
    filter += ' AND r.employee_id = ?';
    params.push(employee_id);
  }

  const records = db.prepare(`
    SELECT r.*, e.first_name, e.last_name, e.employee_number, e.department,
           (SELECT COUNT(*) FROM anomalies a WHERE a.attendance_record_id = r.id) as anomaly_count
    FROM attendance_records r
    JOIN employees e ON r.employee_id = e.id
    ${filter}
    ORDER BY r.date DESC, r.clock_in_at DESC
  `).all(...params) as any[];

  // Build CSV with UTF-8 BOM for French Excel compatibility
  const BOM = '\uFEFF';
  const headers = [
    'Date',
    'Matricule',
    'Employé',
    'Département',
    'Arrivée',
    'Départ',
    'Durée (Minutes)',
    'Durée (Formatée)',
    'Statut',
    'Corrigé manuellement',
    'Motif de correction',
    'Anomalies',
  ];

  const escapeCsv = (str: any) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = records.map((r) => {
    const dur = calculateDurationMinutes(r.clock_in_at, r.clock_out_at);

    const clockInStr = r.clock_in_at
      ? new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'Africa/Tunis',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(r.clock_in_at))
      : '-';

    const clockOutStr = r.clock_out_at
      ? new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'Africa/Tunis',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(r.clock_out_at))
      : '-';

    return [
      escapeCsv(r.date),
      escapeCsv(r.employee_number || ''),
      escapeCsv(`${r.first_name} ${r.last_name}`),
      escapeCsv(r.department || ''),
      escapeCsv(clockInStr),
      escapeCsv(clockOutStr),
      dur.grossMinutes,
      escapeCsv(formatDurationHuman(dur.grossMinutes)),
      escapeCsv(r.status),
      escapeCsv(r.is_corrected ? 'Oui' : 'Non'),
      escapeCsv(r.correction_reason || ''),
      r.anomaly_count || 0,
    ].join(';');
  });

  const csvContent = BOM + headers.join(';') + '\n' + rows.join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pointages_${start_date || 'tous'}_${end_date || 'tous'}.csv"`);
  res.send(csvContent);
});

// ==========================================
// 7. COMPANY SETTINGS
// ==========================================

apiRouter.get('/admin/settings', requireAdminAuth, (req, res) => {
  const settings = getCompanySettings();
  res.json({ data: settings });
});

apiRouter.put('/admin/settings', requireAdminAuth, (req, res) => {
  const {
    company_name,
    expected_start_time,
    expected_end_time,
    late_grace_minutes,
    long_shift_hours,
    missing_clock_out_hours,
    break_tracking_enabled,
    unpaid_break_minutes,
    early_departure_enabled,
  } = req.body;
  const admin = (req as any).admin;

  db.prepare(`
    UPDATE company_settings
    SET company_name = ?, expected_start_time = ?, expected_end_time = ?,
        late_grace_minutes = ?, long_shift_hours = ?, missing_clock_out_hours = ?,
        break_tracking_enabled = ?, unpaid_break_minutes = ?, early_departure_enabled = ?,
        updated_at = datetime('now')
    WHERE id = 1
  `).run(
    company_name,
    expected_start_time,
    expected_end_time,
    parseInt(late_grace_minutes, 10),
    parseFloat(long_shift_hours),
    parseFloat(missing_clock_out_hours),
    break_tracking_enabled ? 1 : 0,
    parseInt(unpaid_break_minutes, 10),
    early_departure_enabled ? 1 : 0
  );

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, administrator_id, action, entity_type, entity_id, new_values, reason)
    VALUES (?, ?, 'UPDATE_SETTINGS', 'COMPANY_SETTINGS', '1', ?, 'Mise à jour des paramètres entreprise')
  `).run(
    `aud-${Date.now()}`,
    admin.adminId,
    JSON.stringify(req.body)
  );

  res.json({ success: true, message: 'Paramètres mis à jour avec succès.' });
});

// ==========================================
// 8. AUDIT LOGS
// ==========================================

apiRouter.get('/admin/audit-logs', requireAdminAuth, (req, res) => {
  const logs = db.prepare(`
    SELECT * FROM audit_logs 
    ORDER BY created_at DESC 
    LIMIT 100
  `).all();

  res.json({
    data: logs.map((log: any) => ({
      ...log,
      oldValues: log.old_values ? JSON.parse(log.old_values) : null,
      newValues: log.new_values ? JSON.parse(log.new_values) : null,
    })),
  });
});
