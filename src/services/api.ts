import { CompanySettings, Employee, AttendanceRecord, Anomaly, DashboardStats, EmployeeDashboardStatus, AuditLog } from '../types';

let adminToken: string | null = localStorage.getItem('pointage_admin_token');

export function setAdminToken(token: string | null) {
  adminToken = token;
  if (token) {
    localStorage.setItem('pointage_admin_token', token);
  } else {
    localStorage.removeItem('pointage_admin_token');
  }
}

export function getAdminToken(): string | null {
  return adminToken;
}

function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (adminToken) {
    headers['Authorization'] = `Bearer ${adminToken}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Une erreur inattendue est survenue.');
  }
  return data;
}

export const api = {
  // KIOSK
  getKioskTime: async () => {
    const res = await fetch('/api/kiosk/time');
    return handleResponse<{
      iso: string;
      localDate: string;
      localTime: string;
      formattedDate: string;
      timezone: string;
    }>(res);
  },

  kioskCheckStatus: async (pin: string) => {
    const res = await fetch('/api/kiosk/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    return handleResponse<{
      employeeName: string;
      employeeFullName: string;
      department: string | null;
      hasOpenShift: boolean;
      shift: any;
    }>(res);
  },

  kioskClockIn: async (pin: string) => {
    const res = await fetch('/api/kiosk/clock-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    return handleResponse<{
      success: boolean;
      employeeId: string;
      firstName: string;
      clockInAt: string;
      clockInTimeFormatted: string;
      message: string;
      isLate: boolean;
    }>(res);
  },

  kioskClockOut: async (pin: string) => {
    const res = await fetch('/api/kiosk/clock-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    return handleResponse<{
      success: boolean;
      firstName: string;
      startTimeFormatted: string;
      endTimeFormatted: string;
      durationMinutes: number;
      durationFormatted: string;
      message: string;
    }>(res);
  },

  // ADMIN AUTH
  adminLogin: async (email: string, password: string) => {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await handleResponse<{
      success: boolean;
      token: string;
      user: { id: string; email: string; name: string };
    }>(res);
    setAdminToken(data.token);
    return data;
  },

  adminLogout: async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } finally {
      setAdminToken(null);
    }
  },

  adminGetMe: async () => {
    const res = await fetch('/api/admin/me', {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ user: { id: string; email: string; name: string } }>(res);
  },

  // DASHBOARD
  getDashboardData: async (date?: string) => {
    const url = date ? `/api/admin/dashboard?date=${date}` : '/api/admin/dashboard';
    const res = await fetch(url, { headers: getAuthHeaders() });
    return handleResponse<{
      date: string;
      stats: DashboardStats;
      employeeStatuses: EmployeeDashboardStatus[];
    }>(res);
  },

  // ATTENDANCE
  getAttendance: async (params: {
    employee_id?: string;
    date?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
    has_anomaly?: string;
    sort_by?: string;
    sort_order?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== '') query.append(key, String(val));
    });
    const res = await fetch(`/api/admin/attendance?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{
      data: AttendanceRecord[];
      pagination: { total: number; page: number; pageSize: number; totalPages: number };
    }>(res);
  },

  getAttendanceDetail: async (id: string) => {
    const res = await fetch(`/api/admin/attendance/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{
      record: any;
      events: any[];
      anomalies: any[];
      auditLogs: AuditLog[];
    }>(res);
  },

  correctAttendance: async (id: string, payload: {
    clock_in_at?: string;
    clock_out_at?: string;
    break_minutes?: number;
    reason: string;
  }) => {
    const res = await fetch(`/api/admin/attendance/${id}/correct`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  // EMPLOYEES
  getEmployees: async () => {
    const res = await fetch('/api/admin/employees', { headers: getAuthHeaders() });
    return handleResponse<{ data: Employee[] }>(res);
  },

  createEmployee: async (payload: {
    employee_number?: string;
    first_name: string;
    last_name: string;
    pin: string;
    department?: string;
    notes?: string;
  }) => {
    const res = await fetch('/api/admin/employees', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<{ success: boolean; message: string; id: string }>(res);
  },

  updateEmployee: async (id: string, payload: {
    employee_number?: string;
    first_name?: string;
    last_name?: string;
    pin?: string;
    is_active?: boolean | number;
    department?: string;
    notes?: string;
  }) => {
    const res = await fetch(`/api/admin/employees/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  // ANOMALIES
  getAnomalies: async (params?: { status?: string; employee_id?: string; anomaly_type?: string }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v) query.append(k, v);
      });
    }
    const res = await fetch(`/api/admin/anomalies?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ data: Anomaly[] }>(res);
  },

  resolveAnomaly: async (id: string, payload: { status: string; resolution_notes?: string }) => {
    const res = await fetch(`/api/admin/anomalies/${id}/resolve`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  runAnomalyScan: async () => {
    const res = await fetch('/api/admin/anomalies/run-check', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  // REPORTS
  getReportsSummary: async (params: { start_date?: string; end_date?: string; employee_id?: string }) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) query.append(k, v);
    });
    const res = await fetch(`/api/admin/reports/summary?${query.toString()}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{
      totalShifts: number;
      completedShifts: number;
      openShifts: number;
      totalGrossMinutes: number;
      totalGrossFormatted: string;
      anomaliesCount: number;
    }>(res);
  },

  getExportCsvUrl: (params: { start_date?: string; end_date?: string; employee_id?: string }) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) query.append(k, v);
    });
    return `/api/admin/reports/export-csv?${query.toString()}`;
  },

  // SETTINGS
  getSettings: async () => {
    const res = await fetch('/api/admin/settings', { headers: getAuthHeaders() });
    return handleResponse<{ data: CompanySettings }>(res);
  },

  updateSettings: async (settings: Partial<CompanySettings>) => {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(settings),
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  // AUDIT LOGS
  getAuditLogs: async () => {
    const res = await fetch('/api/admin/audit-logs', { headers: getAuthHeaders() });
    return handleResponse<{ data: AuditLog[] }>(res);
  },
};
