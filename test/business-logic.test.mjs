import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDurationMinutes,
  formatDurationHuman,
  checkLateArrival,
  checkEarlyDeparture,
  getTunisCurrentDateString,
  getTunisHoursAndMinutes,
} from '../server/attendance-logic.js';

describe('Calcul des durées & Gestion des shifts', () => {
  test('Calcule correctement la durée brute en minutes', () => {
    const inIso = '2026-10-13T08:00:00.000Z';
    const outIso = '2026-10-13T17:00:00.000Z';
    const dur = calculateDurationMinutes(inIso, outIso);
    assert.equal(dur.grossMinutes, 540); // 9 hours = 540 min
  });

  test('Gère les shifts de nuit traversant minuit', () => {
    const inIso = '2026-10-13T22:00:00.000Z';
    const outIso = '2026-10-14T06:00:00.000Z';
    const dur = calculateDurationMinutes(inIso, outIso);
    assert.equal(dur.grossMinutes, 480); // 8 hours = 480 min
  });

  test('Formate les durées lisibles en français', () => {
    assert.equal(formatDurationHuman(0), '0 min');
    assert.equal(formatDurationHuman(45), '45 min');
    assert.equal(formatDurationHuman(60), '1 h 00 min');
    assert.equal(formatDurationHuman(527), '8 h 47 min');
  });

  test('Gère les cas limites d\'horodatages invalides ou nuls', () => {
    const dur = calculateDurationMinutes(null, null);
    assert.equal(dur.grossMinutes, 0);
  });
});

describe('Détection des anomalies & Règles horaires', () => {
  const mockSettings = {
    id: 1,
    company_name: 'Société Tunisienne de Services',
    timezone: 'Africa/Tunis',
    expected_start_time: '08:00',
    expected_end_time: '17:00',
    late_grace_minutes: 15,
    working_days: '[1,2,3,4,5]',
    long_shift_hours: 10.0,
    missing_clock_out_hours: 12.0,
    break_tracking_enabled: 0,
    unpaid_break_minutes: 60,
    early_departure_enabled: 1,
  };

  test('Ne déclenche pas de retard si dans le délai de grâce (ex: 08:10 avec grâce de 15 min)', () => {
    // 08:10 Tunis time (Tunis is UTC+1 year-round, so 07:10 UTC)
    const clockInIso = '2026-10-13T07:10:00.000Z';
    const check = checkLateArrival(clockInIso, mockSettings);
    assert.equal(check.isLate, false);
    assert.equal(check.minutesLate, 0);
  });

  test('Déclenche une anomalie de retard si au-delà de la tolérance (ex: 08:35)', () => {
    // 08:35 Tunis time is 07:35 UTC
    const clockInIso = '2026-10-13T07:35:00.000Z';
    const check = checkLateArrival(clockInIso, mockSettings);
    assert.equal(check.isLate, true);
    assert.equal(check.minutesLate, 35);
  });

  test('Déclenche un départ anticipé si sortie avant l\'heure prévue (ex: 16:30 au lieu de 17:00)', () => {
    // 16:30 Tunis time is 15:30 UTC
    const clockOutIso = '2026-10-13T15:30:00.000Z';
    const check = checkEarlyDeparture(clockOutIso, mockSettings);
    assert.equal(check.isEarly, true);
    assert.equal(check.minutesEarly, 30);
  });

  test('Formate la date locale en Tunisie (Africa/Tunis)', () => {
    const now = new Date('2026-10-13T23:30:00.000Z'); // 23:30 UTC = 00:30 next day in Tunis
    const tunisDate = getTunisCurrentDateString(now);
    assert.equal(tunisDate, '2026-10-14');
  });
});
