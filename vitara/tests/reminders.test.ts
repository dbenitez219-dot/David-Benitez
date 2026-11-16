import assert from 'node:assert/strict';
import { localParts, isDue, isPaused, toMinutes } from '../supabase/functions/_shared/reminders.ts';

// 2026-11-16 (lunes) 23:30 UTC = lunes 20:30 en Montevideo (UTC-3) = martes 08:30 en Auckland (UTC+13)
const now = new Date('2026-11-16T23:30:00Z');
let l = localParts(now, 'America/Montevideo');
assert.deepEqual([l.date, l.hhmm, l.weekday], ['2026-11-16', '20:30', 1]);
l = localParts(now, 'Pacific/Auckland');
assert.deepEqual([l.date, l.hhmm, l.weekday], ['2026-11-17', '12:30', 2]);
assert.equal(localParts(now, 'Zona/Invalida').hhmm, '23:30', 'zona inválida cae a UTC');

l = localParts(now, 'America/Montevideo');
assert.ok(isDue(l, '20:30')); assert.ok(isDue(l, '20:27')); assert.ok(!isDue(l, '20:20'), 'fuera de ventana');
assert.ok(!isDue(l, '20:31'), 'aún no llegó');
assert.ok(isDue(l, '20:10', 20), 'recordatorio de foto +20 min');
assert.equal(toMinutes('08:05'), 485);
assert.ok(isPaused({ enabled: false, paused_until: null })); assert.ok(!isPaused(null));
assert.ok(isPaused({ enabled: true, paused_until: '2026-11-17T00:00:00Z' }, now)); assert.ok(!isPaused({ enabled: true, paused_until: '2026-11-16T00:00:00Z' }, now));
console.log('reminders: todo OK');
