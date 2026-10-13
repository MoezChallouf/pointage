import React, { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle2, AlertCircle, Building2, Clock, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { CompanySettings } from '../types';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings()
      .then((res) => setSettings(res.data))
      .catch((err) => setErrorMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await api.updateSettings(settings);
      setSuccessMessage('Paramètres de l\'entreprise mis à jour avec succès.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Impossible d\'enregistrer les modifications.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
        Chargement des paramètres...
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Paramètres de l'entreprise & Règles de pointage</h2>
        <p className="text-xs text-slate-500">
          Configuration des horaires officiels, tolérances de retard et seuils de déclenchement des anomalies
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {successMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Section 1: Organisation & Fuseau horaire */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">Identité & Localisation</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Raison sociale de l'entreprise
              </label>
              <input
                type="text"
                required
                value={settings.company_name}
                onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Fuseau horaire de référence
              </label>
              <input
                type="text"
                disabled
                value={settings.timezone}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-500 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Fixé à Africa/Tunis (UTC+1 toute l'année)</span>
            </div>
          </div>
        </div>

        {/* Section 2: Horaires de travail & Tolérances */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Clock className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">Horaires de référence & Tolérances</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Heure de début prévue
              </label>
              <input
                type="time"
                required
                value={settings.expected_start_time}
                onChange={(e) => setSettings({ ...settings, expected_start_time: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Heure normale de début de vacation (ex: 08:00)</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Heure de fin prévue
              </label>
              <input
                type="time"
                required
                value={settings.expected_end_time}
                onChange={(e) => setSettings({ ...settings, expected_end_time: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Heure normale de sortie (ex: 17:00)</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Délai de grâce retard (Minutes)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                required
                value={settings.late_grace_minutes}
                onChange={(e) => setSettings({ ...settings, late_grace_minutes: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Tolérance avant déclenchement d'un retard (ex: 15 min)</span>
            </div>
          </div>
        </div>

        {/* Section 3: Seuils d'anomalies */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">Seuils d'alertes & Détections automatiques</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Seuil d'alerte départ oublié (Heures)
              </label>
              <input
                type="number"
                step="0.5"
                min={4}
                max={24}
                required
                value={settings.missing_clock_out_hours}
                onChange={(e) => setSettings({ ...settings, missing_clock_out_hours: parseFloat(e.target.value) || 12 })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Un shift ouvert au-delà de cette durée est qualifié d'oubli de départ (ex: 12 h).</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Seuil shift anormalement long (Heures)
              </label>
              <input
                type="number"
                step="0.5"
                min={6}
                max={24}
                required
                value={settings.long_shift_hours}
                onChange={(e) => setSettings({ ...settings, long_shift_hours: parseFloat(e.target.value) || 10 })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Déclenche une anomalie de durée excessive au-delà de ce volume (ex: 10 h).</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.early_departure_enabled}
                onChange={(e) => setSettings({ ...settings, early_departure_enabled: e.target.checked ? 1 : 0 })}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 w-4 h-4"
              />
              <span>Activer la détection automatique des départs anticipés avant l'heure de fin prévue</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
          </button>
        </div>
      </form>
    </div>
  );
};
