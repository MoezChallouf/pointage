import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle2, History, Clock } from 'lucide-react';
import { api } from '../services/api';

interface CorrectionModalProps {
  isOpen: boolean;
  record: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const CorrectionModal: React.FC<CorrectionModalProps> = ({
  isOpen,
  record,
  onClose,
  onSuccess,
}) => {
  const [clockInDate, setClockInDate] = useState<string>('');
  const [clockInTime, setClockInTime] = useState<string>('');
  const [clockOutDate, setClockOutDate] = useState<string>('');
  const [clockOutTime, setClockOutTime] = useState<string>('');
  const [breakMinutes, setBreakMinutes] = useState<number>(0);
  const [reasonPreset, setReasonPreset] = useState<string>('Oubli de pointage à l\'arrivée');
  const [customReason, setCustomReason] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (record) {
      if (record.clock_in_at || record.clockInAt) {
        const d = new Date(record.clock_in_at || record.clockInAt);
        // format in Tunis time
        const dateStr = d.toISOString().split('T')[0];
        const timeStr = d.toTimeString().split(' ')[0].substring(0, 5);
        setClockInDate(dateStr);
        setClockInTime(timeStr);
      } else {
        setClockInDate(record.date);
        setClockInTime('08:00');
      }

      if (record.clock_out_at || record.clockOutAt) {
        const d = new Date(record.clock_out_at || record.clockOutAt);
        const dateStr = d.toISOString().split('T')[0];
        const timeStr = d.toTimeString().split(' ')[0].substring(0, 5);
        setClockOutDate(dateStr);
        setClockOutTime(timeStr);
      } else {
        setClockOutDate(record.date);
        setClockOutTime('17:00');
      }

      setBreakMinutes(record.break_minutes || record.breakMinutes || 0);
      setCustomReason('');
      setError(null);
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const finalReason = reasonPreset === 'Autre motif' ? customReason.trim() : reasonPreset;

    if (!finalReason || finalReason.length < 4) {
      setError('Veuillez indiquer un motif de correction détaillé (minimum 4 caractères).');
      setLoading(false);
      return;
    }

    // Build ISO timestamps
    let newInIso: string | undefined = undefined;
    if (clockInDate && clockInTime) {
      newInIso = new Date(`${clockInDate}T${clockInTime}:00`).toISOString();
    }

    let newOutIso: string | undefined = undefined;
    if (clockOutDate && clockOutTime) {
      newOutIso = new Date(`${clockOutDate}T${clockOutTime}:00`).toISOString();
    }

    if (newInIso && newOutIso) {
      const inMs = new Date(newInIso).getTime();
      const outMs = new Date(newOutIso).getTime();
      if (outMs <= inMs) {
        setError('L\'heure de fin de service doit être strictement postérieure à l\'heure de début.');
        setLoading(false);
        return;
      }
    }

    try {
      await api.correctAttendance(record.id, {
        clock_in_at: newInIso,
        clock_out_at: newOutIso,
        break_minutes: breakMinutes,
        reason: finalReason,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Impossible d\'enregistrer la correction.');
    } finally {
      setLoading(false);
    }
  };

  const employeeName = record.employeeName || `${record.first_name || ''} ${record.last_name || ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Correction manuelle du pointage</h2>
              <p className="text-xs text-slate-500">
                {employeeName} · Fiche du {record.date}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Clock In */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Heure d'arrivée (Début de service)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-slate-500 block mb-1">Date</span>
                <input
                  type="date"
                  required
                  value={clockInDate}
                  onChange={(e) => setClockInDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block mb-1">Heure (HH:MM)</span>
                <input
                  type="time"
                  required
                  value={clockInTime}
                  onChange={(e) => setClockInTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Clock Out */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Heure de départ (Fin de service)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-slate-500 block mb-1">Date</span>
                <input
                  type="date"
                  required
                  value={clockOutDate}
                  onChange={(e) => setClockOutDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block mb-1">Heure (HH:MM)</span>
                <input
                  type="time"
                  required
                  value={clockOutTime}
                  onChange={(e) => setClockOutTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Reason - Mandatory */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Motif de correction obligatoire
            </label>
            <select
              value={reasonPreset}
              onChange={(e) => setReasonPreset(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-slate-900 mb-2"
            >
              <option value="Oubli de pointage à l'arrivée">Oubli de pointage à l'arrivée</option>
              <option value="Oubli de pointage au départ">Oubli de pointage au départ</option>
              <option value="Erreur de saisie de l'employé">Erreur de saisie de l'employé</option>
              <option value="Correction après vérification managériale">Correction après vérification managériale</option>
              <option value="Problème technique temporaire">Problème technique temporaire</option>
              <option value="Autre motif">Autre motif (personnalisé)...</option>
            </select>

            {reasonPreset === 'Autre motif' && (
              <textarea
                required
                rows={2}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Précisez la raison détaillée de la modification..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            )}
            <p className="text-[11px] text-slate-500 mt-1">
              Cette action est irréversiblement consignée dans le journal d'audit immuable avec votre identifiant administrateur.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              {loading ? 'Enregistrement...' : 'Confirmer et corriger'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
