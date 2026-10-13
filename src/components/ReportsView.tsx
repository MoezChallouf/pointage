import React, { useState, useEffect } from 'react';
import { 
  Download, Printer, Calendar, Users, Clock, AlertTriangle, 
  CheckCircle2, FileSpreadsheet, ArrowRight 
} from 'lucide-react';
import { api } from '../services/api';
import { Employee } from '../types';

export const ReportsView: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  
  // Date range defaults: This month
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const firstDay = `${year}-${month}-01`;
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(now);

  const [startDate, setStartDate] = useState<string>(firstDay);
  const [endDate, setEndDate] = useState<string>(todayStr);

  const [summary, setSummary] = useState<{
    totalShifts: number;
    completedShifts: number;
    openShifts: number;
    totalGrossMinutes: number;
    totalGrossFormatted: string;
    anomaliesCount: number;
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    api.getEmployees().then((res) => setEmployees(res.data)).catch(console.error);
  }, []);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const data = await api.getReportsSummary({
        start_date: startDate,
        end_date: endDate,
        employee_id: selectedEmployee || undefined,
      });
      setSummary(data);
    } catch (err) {
      console.error('Failed to load reports summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [startDate, endDate, selectedEmployee]);

  // Preset handlers
  const handleSetPreset = (preset: 'today' | 'week' | 'month' | 'last_month') => {
    const d = new Date();
    if (preset === 'today') {
      const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(d);
      setStartDate(t);
      setEndDate(t);
    } else if (preset === 'week') {
      const day = d.getDay() || 7; // Monday = 1
      const mon = new Date(d);
      mon.setDate(d.getDate() - day + 1);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      setStartDate(mon.toISOString().split('T')[0]);
      setEndDate(sun.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      setStartDate(`${y}-${m}-01`);
      setEndDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(d));
    } else if (preset === 'last_month') {
      const prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const y = prevMonth.getFullYear();
      const m = String(prevMonth.getMonth() + 1).padStart(2, '0');
      const lastDayPrev = new Date(y, prevMonth.getMonth() + 1, 0).getDate();
      setStartDate(`${y}-${m}-01`);
      setEndDate(`${y}-${m}-${lastDayPrev}`);
    }
  };

  const handleExportCsv = () => {
    const url = api.getExportCsvUrl({
      start_date: startDate,
      end_date: endDate,
      employee_id: selectedEmployee || undefined,
    });
    window.location.href = url;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Configuration Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Rapports & Exports de présence</h2>
            <p className="text-xs text-slate-500">
              Génération des synthèses périodiques et téléchargement des feuilles d'émargement Excel
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              Imprimer la feuille
            </button>

            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Télécharger l'export Excel (CSV)
            </button>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[11px] font-medium text-slate-400 mr-1">Périodes prédéfinies :</span>
          <button
            onClick={() => handleSetPreset('today')}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => handleSetPreset('week')}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
          >
            Cette semaine
          </button>
          <button
            onClick={() => handleSetPreset('month')}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
          >
            Ce mois-ci
          </button>
          <button
            onClick={() => handleSetPreset('last_month')}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
          >
            Mois dernier
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Collaborateur ciblé</label>
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
            >
              <option value="">Tous les collaborateurs (Globale)</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} ({emp.employee_number || 'N/A'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Date début</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Date fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
            />
          </div>
        </div>
      </div>

      {/* Printable Sheet & Overview */}
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-2xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Société Tunisienne de Services</h1>
            <p className="text-xs text-slate-500">Rapport d'émargement et récapitulatif des heures de présence</p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p><strong>Période :</strong> du {startDate} au {endDate}</p>
            <p><strong>Filtre employé :</strong> {selectedEmployee ? 'Fiche individuelle' : 'Tous collaborateurs'}</p>
          </div>
        </div>

        {/* Aggregated KPI Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 block mb-1">Shifts totaux enregistrés</span>
            <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {summary?.totalShifts ?? 0}
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 block mb-1">Shifts clôturés avec succès</span>
            <div className="text-2xl font-bold font-mono text-emerald-600 tabular-nums">
              {summary?.completedShifts ?? 0}
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 block mb-1">Volume horaire total</span>
            <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {summary?.totalGrossFormatted ?? '0 min'}
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 block mb-1">Anomalies recensées</span>
            <div className="text-2xl font-bold font-mono text-rose-600 tabular-nums">
              {summary?.anomaliesCount ?? 0}
            </div>
          </div>
        </div>

        {/* Export Details info */}
        <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Format CSV compatible Microsoft Excel & LibreOffice Calc
          </div>
          <p>
            L'export CSV utilise l'encodage universel UTF-8 avec BOM (`\uFEFF`) et des séparateurs point-virgule (`;`), garantissant l'affichage sans corruption des accents français et des caractères spéciaux dans Excel en Tunisie.
          </p>
        </div>
      </div>
    </div>
  );
};
