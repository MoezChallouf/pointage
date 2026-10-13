export interface CompanySettings {
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

export interface Employee {
  id: string;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  is_active: number | boolean;
  department: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  total_shifts?: number;
  open_shift_id?: string | null;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeNumber?: string | null;
  employeeName: string;
  department?: string | null;
  date: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  breakMinutes: number;
  grossMinutes: number;
  netMinutes: number;
  durationFormatted: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ANOMALY';
  isCorrected: boolean;
  correctionReason?: string | null;
  activeAnomalyCount?: number;
  anomalyTypes?: string[];
  updatedAt?: string;
}

export interface Anomaly {
  id: string;
  employee_id: string;
  first_name?: string;
  last_name?: string;
  employee_number?: string | null;
  attendance_record_id: string | null;
  attendance_date?: string | null;
  clock_in_at?: string | null;
  clock_out_at?: string | null;
  anomaly_type: 'MISSING_CLOCK_IN' | 'MISSING_CLOCK_OUT' | 'LATE_ARRIVAL' | 'EARLY_DEPARTURE' | 'LONG_SHIFT' | 'CONFLICTING_SHIFT' | 'MISSING_ATTENDANCE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  detected_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution_notes?: string | null;
}

export interface AuditLog {
  id: string;
  administrator_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  oldValues: any;
  newValues: any;
  reason: string;
  created_at: string;
}

export interface DashboardStats {
  totalEmployees: number;
  currentlyWorking: number;
  completedToday: number;
  notClockedInToday: number;
  openAnomaliesCount: number;
  totalMinutesWorkedToday: number;
  totalHoursFormatted: string;
}

export interface EmployeeDashboardStatus {
  employeeId: string;
  employeeNumber: string | null;
  fullName: string;
  department: string | null;
  status: 'Non pointé' | 'En service' | 'Service terminé' | 'Anomalie à vérifier' | 'Absence à vérifier';
  recordId: string | null;
  clockInAt: string | null;
  clockInFormatted: string | null;
  clockOutAt: string | null;
  clockOutFormatted: string | null;
  durationFormatted: string | null;
  durationMinutes: number;
  hasAnomaly: boolean;
}
