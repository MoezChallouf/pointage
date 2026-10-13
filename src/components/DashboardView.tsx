import React, { useState, useEffect } from 'react';
import { 
  Users, PlayCircle, CheckCircle2, UserX, AlertTriangle, 
  Clock, RefreshCw, Calendar, Edit3, ArrowUpRight 
} from 'lucide-react';
import { api } from '../services/api';
import { DashboardStats, EmployeeDashboardStatus } from '../types';

interface DashboardViewProps {
  onNavigateToAttendance: (date?: string) => void;
  onNavigateToAnomalies: () => void;
  onOpenCorrection: (record: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateToAttendance,
  onNavigateToAnomalies,
  onOpenCorrection,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Current date in Tunis
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(new Date());
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [employees, setEmployees] = useState<EmployeeDashboardStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchDashboard = async (date: string, isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const data = await api.getDashboardData(date);
      setStats(data.stats);
      setEmployees(data.employeeStatuses);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard(selectedDate);
    // Automatic refresh every 30 seconds
    const interval = setInterval(() => {
      fetchDashboard(selectedDate, true);
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  const getStatusBadge = (status: EmployeeDashboardStatus['status']) => {
    switch (status) {
      case 'En service':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            En service
          </span>
        );
      case 'Service terminé':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
            Service terminé
          </span>
        );
      case 'Anomalie à vérifier':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            Anomalie à vérifier
          </span>
        );
      case 'Absence à vérifier':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Absence à vérifier
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-500 border border-slate-200">
            Non pointé
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Tableau de bord de présence</h2>
          <p className="text-xs text-slate-500">Supervision en temps réel des pointages de l'équipe (5 collaborateurs)</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => fetchDashboard(selectedDate, true)}
            disabled={refreshing}
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Rafraîchir les données"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Collaborateurs</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {stats?.totalEmployees ?? 5}
          </div>
          <span className="text-[11px] text-slate-400">Actifs dans l'effectif</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">En service</span>
            <PlayCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 tabular-nums">
            {stats?.currentlyWorking ?? 0}
          </div>
          <span className="text-[11px] text-emerald-600/80">Présents en ce moment</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Service terminé</span>
            <CheckCircle2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {stats?.completedToday ?? 0}
          </div>
          <span className="text-[11px] text-slate-400">Journée clôturée</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Non pointés</span>
            <UserX className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-700 tabular-nums">
            {stats?.notClockedInToday ?? 0}
          </div>
          <span className="text-[11px] text-slate-400">Sans pointage ce jour</span>
        </div>

        <div 
          onClick={onNavigateToAnomalies}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs cursor-pointer hover:border-rose-300 transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium text-rose-700">Anomalies</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-600 tabular-nums">
            {stats?.openAnomaliesCount ?? 0}
          </div>
          <span className="text-[11px] text-rose-500/80 flex items-center gap-1">
            À traiter <ArrowUpRight className="w-3 h-3" />
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Temps cumulé</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {stats?.totalHoursFormatted ?? '0 min'}
          </div>
          <span className="text-[11px] text-slate-400">Enregistré ce jour</span>
        </div>
      </div>

      {/* Main Employee Status Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Statut des collaborateurs ({selectedDate})
          </h3>
          <span className="text-xs text-slate-500">Mise à jour automatique</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 font-medium">
                <th className="py-3 px-4">Collaborateur</th>
                <th className="py-3 px-4">Matricule</th>
                <th className="py-3 px-4">Département</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Arrivée</th>
                <th className="py-3 px-4">Départ</th>
                <th className="py-3 px-4">Durée</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Aucun employé trouvé.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.employeeId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {emp.fullName}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">
                      {emp.employeeNumber || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {emp.department || 'Général'}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(emp.status)}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700">
                      {emp.clockInFormatted || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700">
                      {emp.clockOutFormatted || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums font-medium text-slate-900">
                      {emp.durationFormatted || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {emp.recordId ? (
                        <button
                          onClick={() => onOpenCorrection({
                            id: emp.recordId,
                            employeeName: emp.fullName,
                            date: selectedDate,
                            clock_in_at: emp.clockInAt,
                            clock_out_at: emp.clockOutAt,
                          })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3 text-slate-500" />
                          Corriger
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
