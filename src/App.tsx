import React, { useState, useEffect } from 'react';
import { KioskScreen } from './components/KioskScreen';
import { LoginModal } from './components/LoginModal';
import { AdminLayout, AdminTab } from './components/AdminLayout';
import { DashboardView } from './components/DashboardView';
import { EmployeesView } from './components/EmployeesView';
import { AttendanceView } from './components/AttendanceView';
import { AnomaliesView } from './components/AnomaliesView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { CorrectionModal } from './components/CorrectionModal';
import { api, getAdminToken, setAdminToken } from './services/api';

export default function App() {
  const [viewMode, setViewMode] = useState<'kiosk' | 'admin'>('kiosk');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');
  
  // Correction modal state
  const [correctionRecord, setCorrectionRecord] = useState<any | null>(null);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);

  // Filter passed to attendance view (e.g. employee history link)
  const [attendanceEmployeeFilter, setAttendanceEmployeeFilter] = useState<string | undefined>();
  const [attendanceDateFilter, setAttendanceDateFilter] = useState<string | undefined>();

  // Check if admin is already authenticated
  useEffect(() => {
    const token = getAdminToken();
    if (token) {
      api.adminGetMe().catch(() => {
        // Token expired or invalid
        setAdminToken(null);
      });
    }
  }, []);

  const handleOpenLogin = () => {
    const token = getAdminToken();
    if (token) {
      // Already logged in, switch directly to admin mode
      setViewMode('admin');
    } else {
      setIsLoginOpen(true);
    }
  };

  const handleLoginSuccess = () => {
    setIsLoginOpen(false);
    setViewMode('admin');
  };

  const handleLogout = async () => {
    await api.adminLogout();
    setViewMode('kiosk');
  };

  const handleOpenCorrection = (record: any) => {
    setCorrectionRecord(record);
    setIsCorrectionOpen(true);
  };

  const handleViewEmployeeHistory = (empId: string) => {
    setAttendanceEmployeeFilter(empId);
    setAdminTab('attendance');
  };

  const handleNavigateToAttendance = (date?: string) => {
    setAttendanceDateFilter(date);
    setAttendanceEmployeeFilter(undefined);
    setAdminTab('attendance');
  };

  const handleNavigateToAnomalies = () => {
    setAdminTab('anomalies');
  };

  return (
    <div className="min-h-screen bg-slate-900 font-sans antialiased text-slate-900 selection:bg-emerald-500 selection:text-white">
      {viewMode === 'kiosk' ? (
        <KioskScreen onOpenAdminLogin={handleOpenLogin} />
      ) : (
        <AdminLayout
          currentTab={adminTab}
          onSelectTab={setAdminTab}
          onSwitchToKiosk={() => setViewMode('kiosk')}
          onLogout={handleLogout}
        >
          {adminTab === 'dashboard' && (
            <DashboardView
              onNavigateToAttendance={handleNavigateToAttendance}
              onNavigateToAnomalies={handleNavigateToAnomalies}
              onOpenCorrection={handleOpenCorrection}
            />
          )}

          {adminTab === 'employees' && (
            <EmployeesView
              onViewEmployeeHistory={handleViewEmployeeHistory}
            />
          )}

          {adminTab === 'attendance' && (
            <AttendanceView
              initialEmployeeId={attendanceEmployeeFilter}
              initialDate={attendanceDateFilter}
              onOpenCorrection={handleOpenCorrection}
            />
          )}

          {adminTab === 'anomalies' && (
            <AnomaliesView
              onOpenCorrection={handleOpenCorrection}
            />
          )}

          {adminTab === 'reports' && (
            <ReportsView />
          )}

          {adminTab === 'settings' && (
            <SettingsView />
          )}
        </AdminLayout>
      )}

      {/* Admin Login Dialog */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSuccess={handleLoginSuccess}
      />

      {/* Manual Correction Dialog */}
      <CorrectionModal
        isOpen={isCorrectionOpen}
        record={correctionRecord}
        onClose={() => setIsCorrectionOpen(false)}
        onSuccess={() => {
          // Trigger reload by re-selecting current tab or updating state
          setAdminTab((t) => t);
        }}
      />
    </div>
  );
}
