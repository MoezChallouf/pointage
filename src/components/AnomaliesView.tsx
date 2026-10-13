import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, CheckCircle, RefreshCw, Filter, 
  Clock, CheckCheck, XCircle, Edit3, Eye, X, AlertCircle 
} from 'lucide-react';
import { api } from '../services/api';
import { Anomaly, Employee } from '../types';

interface AnomaliesViewProps {
  onOpenCorrection: (record: any) => void;
}

export const AnomaliesView: React.FC<AnomaliesViewProps> = ({ onOpenCorrection }) => {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [employeeFilter, setEmployeeFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  // Resolution Modal
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<string>('RESOLVED');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [resolving, setResolving] = useState<boolean>(false);

  useEffect(() => {
    api.getEmployees().then((res) => setEmployees(res.data)).catch(console.error);
  }, []);

  const fetchAnomalies = async () => {
    setLoading(true);
    try {
      const res = await api.getAnomalies({
        status: statusFilter,
        employee_id: employeeFilter || undefined,
        anomaly_type: typeFilter || undefined,
      });
      setAnomalies(res.data);
    } catch (err) {
      console.error('Failed to load anomalies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnomalies();
  }, [statusFilter, employeeFilter, typeFilter]);

  const handleRunScan = async () => {
    setScanning(true);
    try {
      const res = await api.runAnomalyScan();
      alert(res.message);
      fetchAnomalies();
    } catch (err: any) {
      alert(err.message || 'Erreur lors du scan des anomalies.');
    } finally {
      setScanning(false);
    }
  };

  const handleOpenResolve = (anom: Anomaly) => {
    setSelectedAnomaly(anom);
    setResolutionStatus('RESOLVED');
    setResolutionNotes(anom.resolution_notes || 'Vérification effectuée et régularisée.');
  };

  const handleSaveResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnomaly) return;

    setResolving(true);
    try {
      await api.resolveAnomaly(selectedAnomaly.id, {
        status: resolutionStatus,
        resolution_notes: resolutionNotes.trim(),
      });
      setSelectedAnomaly(null);
      fetchAnomalies();
    } catch (err: any) {
      alert(err.message || 'Impossible d\'enregistrer la résolution.');
    } finally {
      setResolving(false);
    }
  };

  const getSeverityBadge = (sev: Anomaly['severity']) => {
    switch (sev) {
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800">Haute</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">Moyenne</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">Faible</span>;
    }
  };

  const getStatusBadge = (status: Anomaly['status']) => {
    switch (status) {
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCheck className="w-3 h-3 text-emerald-500" />
            Résolue
          </span>
        );
      case 'DISMISSED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <XCircle className="w-3 h-3 text-slate-400" />
            Ignorée
          </span>
        );
      case 'IN_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-500" />
            En cours d'examen
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3 text-rose-500" />
            Ouverte
          </span>
        );
    }
  };

  const getTypeNameFr = (type: string) => {
    switch (type) {
      case 'MISSING_CLOCK_IN': return 'Arrivée manquante';
      case 'MISSING_CLOCK_OUT': return 'Départ oublié';
      case 'LATE_ARRIVAL': return 'Arrivée tardive (Retard)';
      case 'EARLY_DEPARTURE': return 'Départ anticipé';
      case 'LONG_SHIFT': return 'Service inhabituellement long';
      case 'CONFLICTING_SHIFT': return 'Chevauchement de shifts';
      case 'MISSING_ATTENDANCE': return 'Absence non justifiée';
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Scan Button */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Gestion des anomalies de pointage</h2>
            <p className="text-xs text-slate-500">
              Détection automatique des retards, oublis de pointage et écarts horaires
            </p>
          </div>

          <button
            onClick={handleRunScan}
            disabled={scanning}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            Lancer un scan automatique
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="OPEN">Ouvertes (À traiter)</option>
              <option value="IN_REVIEW">En cours d'examen</option>
              <option value="RESOLVED">Résolues</option>
              <option value="DISMISSED">Ignorées</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Collaborateur</label>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
            >
              <option value="">Tous les collaborateurs</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Type d'anomalie</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
            >
              <option value="">Tous les types</option>
              <option value="LATE_ARRIVAL">Arrivée tardive</option>
              <option value="MISSING_CLOCK_OUT">Départ oublié</option>
              <option value="MISSING_CLOCK_IN">Arrivée manquante</option>
              <option value="EARLY_DEPARTURE">Départ anticipé</option>
              <option value="LONG_SHIFT">Service trop long</option>
            </select>
          </div>
        </div>
      </div>

      {/* Anomalies List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 font-medium">
                <th className="py-3 px-4">Type & Gravité</th>
                <th className="py-3 px-4">Collaborateur</th>
                <th className="py-3 px-4">Date / Fiche</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Chargement des anomalies...
                  </td>
                </tr>
              ) : anomalies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Aucune anomalie signalée.
                  </td>
                </tr>
              ) : (
                anomalies.map((anom) => (
                  <tr key={anom.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">
                        {getTypeNameFr(anom.anomaly_type)}
                      </div>
                      <div className="mt-1">{getSeverityBadge(anom.severity)}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900">
                        {anom.first_name} {anom.last_name}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-700">
                      {anom.attendance_date || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-sm">
                      {anom.description}
                      {anom.resolution_notes && (
                        <div className="mt-1 text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                          Résolution : {anom.resolution_notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(anom.status)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {anom.attendance_record_id && (
                          <button
                            onClick={() => onOpenCorrection({
                              id: anom.attendance_record_id,
                              employeeName: `${anom.first_name} ${anom.last_name}`,
                              date: anom.attendance_date,
                              clock_in_at: anom.clock_in_at,
                              clock_out_at: anom.clock_out_at,
                            })}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors cursor-pointer"
                            title="Corriger l'horaire de la fiche"
                          >
                            <Edit3 className="w-3 h-3 text-slate-500" />
                            Corriger
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenResolve(anom)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer shadow-2xs"
                        >
                          Traiter
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolution Modal */}
      {selectedAnomaly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Traitement de l'anomalie
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedAnomaly.first_name} {selectedAnomaly.last_name} · {getTypeNameFr(selectedAnomaly.anomaly_type)}
                </p>
              </div>
              <button onClick={() => setSelectedAnomaly(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveResolution} className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                <strong className="block text-slate-900 mb-0.5">Description de l'anomalie :</strong>
                {selectedAnomaly.description}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nouveau statut
                </label>
                <select
                  value={resolutionStatus}
                  onChange={(e) => setResolutionStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="RESOLVED">Marquer comme Résolue</option>
                  <option value="DISMISSED">Marquer comme Ignorée (Fausse alerte)</option>
                  <option value="IN_REVIEW">Placer En cours d'examen</option>
                  <option value="OPEN">Rouvrir l'anomalie</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes de résolution & Justification RH
                </label>
                <textarea
                  required
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Expliquez la décision ou la correction appliquée..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedAnomaly(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={resolving}
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg shadow-sm"
                >
                  {resolving ? 'Enregistrement...' : 'Enregistrer la résolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
