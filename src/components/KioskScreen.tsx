import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Shield, CheckCircle2, AlertCircle, Delete, RotateCcw, Building2, User, Play, Square, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';

interface KioskScreenProps {
  onOpenAdminLogin: () => void;
}

export const KioskScreen: React.FC<KioskScreenProps> = ({ onOpenAdminLogin }) => {
  // Clock state
  const [tunisTime, setTunisTime] = useState<string>('--:--:--');
  const [tunisDate, setTunisDate] = useState<string>('Chargement de la date...');
  
  // PIN state
  const [pin, setPin] = useState<string>('');
  const [maskPin, setMaskPin] = useState<boolean>(true);
  
  // Interaction & response states
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
    subText?: string;
  } | null>(null);

  // Active shift info if recently clocked in or inspected
  const [activeShiftSession, setActiveShiftSession] = useState<{
    firstName: string;
    clockInAt: string;
    clockInTime: string;
  } | null>(null);
  
  // Live elapsed timer for active session
  const [elapsedString, setElapsedString] = useState<string>('00:00:00');

  // Fetch initial server time and start 1-second interval
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeFmt = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Africa/Tunis',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      setTunisTime(timeFmt.format(now));

      const dateFmt = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Africa/Tunis',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const formatted = dateFmt.format(now);
      setTunisDate(formatted.charAt(0).toUpperCase() + formatted.slice(1));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Recalculate elapsed working time from stored start timestamp
  useEffect(() => {
    if (!activeShiftSession?.clockInAt) return;

    const calculateElapsed = () => {
      const startMs = new Date(activeShiftSession.clockInAt).getTime();
      const nowMs = Date.now();
      const diffSecs = Math.max(0, Math.floor((nowMs - startMs) / 1000));

      const h = Math.floor(diffSecs / 3600);
      const m = Math.floor((diffSecs % 3600) / 60);
      const s = diffSecs % 60;

      const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      setElapsedString(formatted);
    };

    calculateElapsed();
    const timer = setInterval(calculateElapsed, 1000);
    return () => clearInterval(timer);
  }, [activeShiftSession]);

  // Keypad actions
  const handleDigit = useCallback((digit: string) => {
    setPin((prev) => {
      if (prev.length < 4) {
        return prev + digit;
      }
      return prev;
    });
  }, []);

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setPin('');
  }, []);

  // Physical keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, handleDigit, handleBackspace, handleClear]);

  // Submit START SHIFT
  const handleStartShift = async () => {
    if (pin.length !== 4) {
      setStatusMessage({
        type: 'error',
        text: 'Veuillez saisir votre code PIN à 4 chiffres avant de commencer.',
      });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await api.kioskClockIn(pin);
      setStatusMessage({
        type: 'success',
        text: res.message,
        subText: res.isLate
          ? 'Attention : votre pointage a été enregistré avec un retard par rapport à l\'horaire prévu.'
          : 'Service actif. Bon courage pour votre journée !',
      });
      setActiveShiftSession({
        firstName: res.firstName,
        clockInAt: res.clockInAt,
        clockInTime: res.clockInTimeFormatted,
      });
      setPin('');
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Impossible d\'enregistrer le début de service.',
      });
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  // Submit END SHIFT
  const handleEndShift = async () => {
    if (pin.length !== 4) {
      setStatusMessage({
        type: 'error',
        text: 'Veuillez saisir votre code PIN à 4 chiffres pour enregistrer votre fin de service.',
      });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await api.kioskClockOut(pin);
      setStatusMessage({
        type: 'success',
        text: res.message,
        subText: `Service clôturé. Arrivée à ${res.startTimeFormatted} — Départ à ${res.endTimeFormatted}.`,
      });
      setActiveShiftSession(null);
      setPin('');
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Impossible d\'enregistrer la fin de service.',
      });
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-white">
      {/* Top Bar */}
      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">Société Tunisienne de Services</h1>
            <p className="text-xs text-slate-400">Borne de Pointage · Tunis (UTC+1)</p>
          </div>
        </div>

        <button
          onClick={onOpenAdminLogin}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          Espace Administrateur
        </button>
      </header>

      {/* Main Kiosk Area */}
      <main className="w-full max-w-xl mx-auto px-6 py-6 flex-1 flex flex-col items-center justify-center">
        {/* Live Digital Clock */}
        <div className="text-center mb-8">
          <div className="text-6xl md:text-7xl font-mono font-bold tracking-tight text-white tabular-nums">
            {tunisTime}
          </div>
          <div className="text-sm md:text-base text-slate-400 font-medium mt-1">
            {tunisDate}
          </div>
        </div>

        {/* Active shift banner if in session */}
        {activeShiftSession && (
          <div className="w-full mb-6 bg-emerald-950/40 border border-emerald-600/40 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <p className="text-sm font-semibold text-emerald-200">
                  {activeShiftSession.firstName} — Service en cours
                </p>
                <p className="text-xs text-emerald-400/80">
                  Début à {activeShiftSession.clockInTime}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Temps écoulé</span>
              <span className="text-base font-mono font-bold text-white tabular-nums">
                {elapsedString}
              </span>
            </div>
          </div>
        )}

        {/* Status Alerts */}
        {statusMessage && (
          <div
            className={`w-full mb-6 p-4 rounded-xl border flex items-start gap-3 transition-all ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200'
                : 'bg-rose-950/40 border-rose-600/40 text-rose-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold">{statusMessage.text}</p>
              {statusMessage.subText && (
                <p className="text-xs opacity-90 mt-1">{statusMessage.subText}</p>
              )}
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Fermer
            </button>
          </div>
        )}

        {/* 4-Digit PIN Display */}
        <div className="w-full max-w-sm mb-6">
          <div className="flex items-center justify-between mb-2 px-1">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Code PIN (4 chiffres)
            </label>
            <button
              type="button"
              onClick={() => setMaskPin(!maskPin)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              {maskPin ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {maskPin ? 'Afficher' : 'Masquer'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((idx) => {
              const char = pin[idx];
              const isFilled = char !== undefined;
              return (
                <div
                  key={idx}
                  className={`h-14 rounded-xl border-2 flex items-center justify-center font-mono text-2xl font-bold transition-all ${
                    isFilled
                      ? 'border-emerald-500 bg-slate-800 text-white shadow-sm'
                      : 'border-slate-700 bg-slate-900/60 text-slate-600'
                  }`}
                >
                  {isFilled ? (maskPin ? '•' : char) : ''}
                </div>
              );
            })}
          </div>
        </div>

        {/* Numeric Keypad */}
        <div className="w-full max-w-sm grid grid-cols-3 gap-3 mb-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={loading}
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-mono text-2xl font-semibold border border-slate-700/80 transition-all flex items-center justify-center shadow-sm cursor-pointer disabled:opacity-50"
            >
              {digit}
            </button>
          ))}

          {/* Clear Button */}
          <button
            type="button"
            disabled={loading}
            onClick={handleClear}
            className="h-14 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-rose-400 hover:text-rose-300 font-medium border border-slate-700 transition-all flex items-center justify-center text-sm cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Effacer
          </button>

          {/* Zero Button */}
          <button
            type="button"
            disabled={loading}
            onClick={() => handleDigit('0')}
            className="h-14 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-mono text-2xl font-semibold border border-slate-700/80 transition-all flex items-center justify-center shadow-sm cursor-pointer disabled:opacity-50"
          >
            0
          </button>

          {/* Backspace Button */}
          <button
            type="button"
            disabled={loading}
            onClick={handleBackspace}
            className="h-14 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white font-medium border border-slate-700 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Action Buttons: START SHIFT & END SHIFT */}
        <div className="w-full max-w-sm grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={loading || pin.length !== 4}
            onClick={handleStartShift}
            className="py-4 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer disabled:cursor-not-allowed border border-emerald-500/30"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>DÉBUT SERVICE</span>
          </button>

          <button
            type="button"
            disabled={loading || pin.length !== 4}
            onClick={handleEndShift}
            className="py-4 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-900 disabled:bg-slate-800/50 disabled:text-slate-600 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 border border-slate-700 shadow-md cursor-pointer disabled:cursor-not-allowed"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>FIN SERVICE</span>
          </button>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="w-full max-w-5xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80">
        <p>Prise en charge du clavier physique (chiffres 0 à 9, retour arrière, Échap).</p>
        <p>PointageRH v1.0 · Conforme réglementation tunisienne</p>
      </footer>
    </div>
  );
};
