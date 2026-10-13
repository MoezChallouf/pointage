import React, { useState, useEffect } from 'react';
import { 
  Filter, Calendar, Search, ArrowUpDown, ChevronLeft, ChevronRight, 
  Edit3, Eye, AlertTriangle, CheckCircle2, Clock, History, X 
} from 'lucide-react';
import { api } from '../services/api';
import { AttendanceRecord, Employee, AuditLog } from '../types';

interface AttendanceViewProps {
  initialEmployeeId?: string;
  initialDate?: string;
  onOpenCorrection: (record: any) => void;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  initialEmployeeId,
  initialDate,
  onOpenCorrection,
}) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [employeeId, setEmployeeId] = useState<string>(initialEmployeeId || '');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [hasAnomalyOnly, setHasAnomalyOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<string>('DESC');
  
  // Pagination
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Detail Modal
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{
    record: any;
    events: any[];
    anomalies: any[];
    auditLogs: AuditLog[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Fetch employees for filter dropdown
  useEffect(() => {
    api.getEmployees().then((res) => setEmployees(res.data)).catch(console.error);
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await api.getAttendance({
        employee_id: employeeId || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        status: status || undefined,
        has_anomaly: hasAnomalyOnly ? 'true' : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        page,
        limit: 15,
      });
      setRecords(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      console.error('Failed to load attendance records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [employeeId, startDate, endDate, status, hasAnomalyOnly, sortBy, sortOrder, page]);

  const handleOpenDetail = async (id: string) => {
    setDetailRecordId(id);
    setDetailLoading(true);
    try {
      const data = await api.getAttendanceDetail(id);
      setDetailData(data);
    } catch (err) {
      console.error('Failed to load detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const formatIsoTime = (iso: string | null) => {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Tunis',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  };

  const getStatusBadge = (rec: AttendanceRecord) => {
    if (rec.status === 'ANOMALY' || (rec.activeAnomalyCount && rec.activeAnomalyCount > 0)) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-3 h-3 text-rose-500" />
          Anomalie
        </span>
      );
    }
    if (rec.clockOutAt) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
          <CheckCircle2 className="w-3 h-3 text-slate-500" />
          Clôturé
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        En cours
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header and Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Historique des pointages</h2>
            <p className="text-xs text-slate-500">
              Journal complet des shifts, temps travaillés et corrections ({totalCount} fiches au total)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEmployeeId('');
                setStartDate('');
                setEndDate('');
                setStatus('');
                setHasAnomalyOnly(false);
                setPage(1);
              }}
              className="text-xs text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Réinitialiser les filtres
            </button>
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
          {/* Employee Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Collaborateur</label>
            <select
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white text-slate-800"
            >
              <option value="">Tous les collaborateurs</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Date début</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white text-slate-800"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Date fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white text-slate-800"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Statut du pointage</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white text-slate-800"
            >
              <option value="">Tous les statuts</option>
              <option value="COMPLETED">Service terminé</option>
              <option value="IN_PROGRESS">En cours</option>
              <option value="ANOMALY">Anomalie détectée</option>
            </select>
          </div>

          {/* Anomaly Checkbox */}
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasAnomalyOnly}
                onChange={(e) => {
                  setHasAnomalyOnly(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 w-4 h-4"
              />
              <span>Anomalies uniquement</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Records Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 font-medium">
                <th 
                  className="py-3 px-4 cursor-pointer hover:text-slate-900"
                  onClick={() => {
                    setSortBy('date');
                    setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
                  }}
                >
                  <div className="flex items-center gap-1">
                    Date <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th 
                  className="py-3 px-4 cursor-pointer hover:text-slate-900"
                  onClick={() => {
                    setSortBy('name');
                    setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
                  }}
                >
                  <div className="flex items-center gap-1">
                    Collaborateur <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Arrivée</th>
                <th className="py-3 px-4">Départ</th>
                <th className="py-3 px-4">Durée brute</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Correction</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Chargement des fiches...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Aucun pointage ne correspond aux critères de recherche.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                      {r.date}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{r.employeeName}</div>
                      <div className="text-[11px] text-slate-400">{r.department || '—'}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700">
                      {formatIsoTime(r.clockInAt)}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700">
                      {formatIsoTime(r.clockOutAt)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium tabular-nums text-slate-900">
                      {r.durationFormatted}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(r)}
                    </td>
                    <td className="py-3.5 px-4">
                      {r.isCorrected ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium" title={r.correctionReason || ''}>
                          <History className="w-3 h-3" />
                          Modifié manuellement
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Brut</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenDetail(r.id)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          title="Voir le détail et l'historique d'audit"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onOpenCorrection({
                            id: r.id,
                            employeeName: r.employeeName,
                            date: r.date,
                            clock_in_at: r.clockInAt,
                            clock_out_at: r.clockOutAt,
                            break_minutes: r.breakMinutes,
                          })}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          title="Corriger l'horaire"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {page} sur {totalPages} ({totalCount} résultats)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail & Audit Modal */}
      {detailRecordId && detailData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Détail du pointage · {detailData.record.first_name} {detailData.record.last_name}
                </h3>
                <p className="text-xs text-slate-500">
                  Date : {detailData.record.date} · Identifiant fiche : <span className="font-mono">{detailData.record.id}</span>
                </p>
              </div>
              <button onClick={() => setDetailRecordId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Timing Overview */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block mb-0.5">Arrivée</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatIsoTime(detailData.record.clock_in_at)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Départ</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatIsoTime(detailData.record.clock_out_at)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Durée totale</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {detailData.record.durationFormatted}
                  </span>
                </div>
              </div>

              {/* Associated Anomalies */}
              {detailData.anomalies.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    Anomalies associées
                  </h4>
                  <div className="space-y-2">
                    {detailData.anomalies.map((anom: any) => (
                      <div key={anom.id} className="p-3 bg-rose-50/60 border border-rose-200 rounded-xl text-xs">
                        <div className="flex items-center justify-between font-medium text-rose-900">
                          <span>{anom.anomaly_type}</span>
                          <span className="text-[11px] px-2 py-0.5 bg-rose-200/60 rounded text-rose-800">
                            {anom.status}
                          </span>
                        </div>
                        <p className="text-rose-700 mt-1">{anom.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Event Timeline */}
              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  Chronologie des événements enregistrés
                </h4>
                <div className="space-y-2 border-l-2 border-slate-200 pl-4 ml-2">
                  {detailData.events.map((evt: any) => (
                    <div key={evt.id} className="relative text-xs">
                      <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-400 border-2 border-white" />
                      <div className="font-medium text-slate-800">
                        {evt.event_type} — {formatIsoTime(evt.event_at)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Source : {evt.created_by}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Immutable Audit Trail */}
              {detailData.auditLogs.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-slate-500" />
                    Journal d'audit administratif (Immuable)
                  </h4>
                  <div className="space-y-2">
                    {detailData.auditLogs.map((log: any) => (
                      <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between text-slate-700 font-medium">
                          <span>Action : {log.action}</span>
                          <span className="font-mono text-[11px] text-slate-400">{log.created_at}</span>
                        </div>
                        <p className="text-slate-600">
                          <strong className="text-slate-800">Motif :</strong> {log.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setDetailRecordId(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => {
                  const rec = detailData.record;
                  setDetailRecordId(null);
                  onOpenCorrection({
                    id: rec.id,
                    employeeName: `${rec.first_name} ${rec.last_name}`,
                    date: rec.date,
                    clock_in_at: rec.clock_in_at,
                    clock_out_at: rec.clock_out_at,
                    break_minutes: rec.break_minutes,
                  });
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm"
              >
                Corriger ce pointage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
