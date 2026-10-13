import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Edit2, Key, Check, X, AlertCircle, History, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import { Employee } from '../types';

interface EmployeesViewProps {
  onViewEmployeeHistory: (employeeId: string) => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({ onViewEmployeeHistory }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [pinChangeEmployee, setPinChangeEmployee] = useState<Employee | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    employee_number: '',
    first_name: '',
    last_name: '',
    pin: '',
    department: '',
    notes: '',
  });

  const [pinData, setPinData] = useState({
    pin: '',
    confirmPin: '',
  });

  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await api.getEmployees();
      setEmployees(res.data);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des employés.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleOpenAdd = () => {
    setFormData({
      employee_number: `EMP-${100 + employees.length + 1}`,
      first_name: '',
      last_name: '',
      pin: '',
      department: '',
      notes: '',
    });
    setModalError(null);
    setIsAddOpen(true);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(formData.pin)) {
      setModalError('Le code PIN doit comporter exactement 4 chiffres numériques.');
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      await api.createEmployee(formData);
      setIsAddOpen(false);
      fetchEmployees();
    } catch (err: any) {
      setModalError(err.message || 'Impossible de créer l\'employé.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormData({
      employee_number: emp.employee_number || '',
      first_name: emp.first_name,
      last_name: emp.last_name,
      pin: '',
      department: emp.department || '',
      notes: emp.notes || '',
    });
    setModalError(null);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    setModalLoading(true);
    setModalError(null);

    try {
      await api.updateEmployee(editingEmployee.id, {
        employee_number: formData.employee_number,
        first_name: formData.first_name,
        last_name: formData.last_name,
        department: formData.department,
        notes: formData.notes,
      });
      setEditingEmployee(null);
      fetchEmployees();
    } catch (err: any) {
      setModalError(err.message || 'Impossible de mettre à jour l\'employé.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleActive = async (emp: Employee) => {
    const nextStatus = !emp.is_active;
    try {
      await api.updateEmployee(emp.id, { is_active: nextStatus });
      fetchEmployees();
    } catch (err: any) {
      alert(err.message || 'Erreur lors du changement de statut.');
    }
  };

  const handleOpenChangePin = (emp: Employee) => {
    setPinChangeEmployee(emp);
    setPinData({ pin: '', confirmPin: '' });
    setModalError(null);
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinChangeEmployee) return;

    if (!/^\d{4}$/.test(pinData.pin)) {
      setModalError('Le code PIN doit comporter exactement 4 chiffres numériques.');
      return;
    }

    if (pinData.pin !== pinData.confirmPin) {
      setModalError('Les deux saisies de code PIN ne correspondent pas.');
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      await api.updateEmployee(pinChangeEmployee.id, { pin: pinData.pin });
      setPinChangeEmployee(null);
      alert(`Le code PIN de ${pinChangeEmployee.first_name} a été modifié avec succès.`);
    } catch (err: any) {
      setModalError(err.message || 'Impossible de modifier le code PIN.');
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Gestion des collaborateurs</h2>
          <p className="text-xs text-slate-500">
            Effectif actuel : {employees.length} collaborateurs · Gestion des profils et attributions des codes PIN
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Ajouter un collaborateur
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Employees Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 font-medium">
                <th className="py-3 px-4">Matricule</th>
                <th className="py-3 px-4">Nom & Prénom</th>
                <th className="py-3 px-4">Département</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Code PIN</th>
                <th className="py-3 px-4">Total Pointages</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Chargement des employés...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Aucun employé enregistré.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                      {emp.employee_number || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">
                        {emp.first_name} {emp.last_name}
                      </div>
                      {emp.notes && (
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">{emp.notes}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {emp.department || 'Non assigné'}
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleToggleActive(emp)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                          emp.is_active
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
                        }`}
                        title="Cliquer pour activer ou désactiver"
                      >
                        {emp.is_active ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleOpenChangePin(emp)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors cursor-pointer"
                        title="Modifier le code PIN"
                      >
                        <Key className="w-3 h-3 text-slate-500" />
                        •••• (Modifier)
                      </button>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-600">
                      {emp.total_shifts ?? 0}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onViewEmployeeHistory(emp.id)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          title="Voir l'historique des pointages"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          title="Modifier les informations"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
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

      {/* Modal: Add Employee */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Nouveau collaborateur</h3>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Prénom *</label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    placeholder="Ex: Amine"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nom *</label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    placeholder="Ex: Mansour"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Matricule</label>
                  <input
                    type="text"
                    value={formData.employee_number}
                    onChange={(e) => setFormData({ ...formData, employee_number: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
                    placeholder="Ex: EMP-106"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Code PIN (4 chiffres) *</label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono tracking-widest text-center"
                    placeholder="••••"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Département / Rôle</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="Ex: Logistique & Exploitation"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes internes (optionnel)</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="Informations supplémentaires..."
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg shadow-sm"
                >
                  {modalLoading ? 'Création...' : 'Créer le collaborateur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Employee */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Modifier {editingEmployee.first_name} {editingEmployee.last_name}
              </h3>
              <button onClick={() => setEditingEmployee(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateEmployee} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Prénom *</label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nom *</label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Matricule</label>
                  <input
                    type="text"
                    value={formData.employee_number}
                    onChange={(e) => setFormData({ ...formData, employee_number: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Département</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg shadow-sm"
                >
                  {modalLoading ? 'Enregistrement...' : 'Mettre à jour'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Change PIN */}
      {pinChangeEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-slate-700" />
                <h3 className="text-base font-semibold text-slate-900">
                  Changer le PIN
                </h3>
              </div>
              <button onClick={() => setPinChangeEmployee(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePin} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Attribution d'un nouveau code PIN à 4 chiffres pour <strong>{pinChangeEmployee.first_name} {pinChangeEmployee.last_name}</strong>.
              </p>

              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nouveau PIN (4 chiffres)</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={pinData.pin}
                  onChange={(e) => setPinData({ ...pinData, pin: e.target.value.replace(/\D/g, '') })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono tracking-widest text-center"
                  placeholder="••••"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirmer le nouveau PIN</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={pinData.confirmPin}
                  onChange={(e) => setPinData({ ...pinData, confirmPin: e.target.value.replace(/\D/g, '') })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono tracking-widest text-center"
                  placeholder="••••"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPinChangeEmployee(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg shadow-sm"
                >
                  {modalLoading ? 'Enregistrement...' : 'Modifier le PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
