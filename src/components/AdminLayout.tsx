import React, { useState } from 'react';
import { 
  LayoutDashboard, Users, Clock, AlertTriangle, 
  FileText, Settings, LogOut, Monitor, Menu, X, Building2 
} from 'lucide-react';
import { api } from '../services/api';

export type AdminTab = 'dashboard' | 'employees' | 'attendance' | 'anomalies' | 'reports' | 'settings';

interface AdminLayoutProps {
  currentTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onSwitchToKiosk: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onSelectTab,
  onSwitchToKiosk,
  onLogout,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { id: AdminTab; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'employees', label: 'Employés', icon: Users },
    { id: 'attendance', label: 'Pointages', icon: Clock },
    { id: 'anomalies', label: 'Anomalies', icon: AlertTriangle },
    { id: 'reports', label: 'Rapports', icon: FileText },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  const handleNavClick = (tab: AdminTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 border-r border-slate-800 shrink-0 select-none">
        {/* Brand */}
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white tracking-tight">PointageRH</h1>
            <p className="text-[11px] text-slate-400">Administration RH</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Actions: Return to Kiosk & Logout */}
        <div className="p-3 border-t border-slate-800 space-y-1">
          <button
            onClick={onSwitchToKiosk}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-emerald-400 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Monitor className="w-4 h-4" />
            <span>Borne de pointage</span>
          </button>

          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <Building2 className="w-5 h-5 text-emerald-400" />
          <span className="font-semibold text-sm">PointageRH Tunisie</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={onSwitchToKiosk}
              className="text-xs text-emerald-400 font-medium py-1 px-2"
            >
              Borne de pointage
            </button>
            <button
              onClick={onLogout}
              className="text-xs text-rose-400 font-medium py-1 px-2"
            >
              Déconnexion
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Administration</span>
            <span>/</span>
            <span className="font-semibold text-slate-800 capitalize">
              {navItems.find((n) => n.id === currentTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Tunis (UTC+1)</span>
            </div>

            <button
              onClick={onSwitchToKiosk}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Afficher la borne</span>
            </button>
          </div>
        </header>

        {/* Viewport Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
