import assert from 'node:assert/strict';
import { suggestNext } from '../app/src/lib/progression.ts';
import { findKnowledge, warningsFor, type Knowledge } from '../app/src/lib/supplementWarnings.ts';
import { hydrationTargetMl, parseDate, ageFrom, num, csv, validTime } from '../app/src/lib/calc.ts';

// Progresión
assert.equal(suggestNext([], 8, 12, false), null);
let s = suggestNext([{ weight_kg: 40, reps: 12 }, { weight_kg: 40, reps: 12 }, { weight_kg: 40, reps: 12 }], 8, 12, false)!;
assert.deepEqual([s.weight_kg, s.reps, s.reason], [42.5, 8, 'increase_weight']);
s = suggestNext([{ weight_kg: 100, reps: 12 }, { weight_kg: 100, reps: 12 }], 8, 12, true)!;
assert.equal(s.weight_kg, 105);
s = suggestNext([{ weight_kg: 40, reps: 10 }, { weight_kg: 40, reps: 9 }, { weight_kg: 40, reps: 8 }], 8, 12, false)!;
assert.deepEqual([s.weight_kg, s.reps, s.reason], [40, 9, 'add_reps']);
s = suggestNext([{ weight_kg: 40, reps: 4 }, { weight_kg: 40, reps: 5 }], 8, 12, false)!;
assert.equal(s.reason, 'reduce'); assert.equal(s.weight_kg, 38);
s = suggestNext([{ weight_kg: null, reps: 10 }, { weight_kg: null, reps: 12 }], 10, 15, false)!;
assert.deepEqual([s.weight_kg, s.reps], [null, 11]);

// Suplementos
const kb: Knowledge[] = [
  { slug: 'creatine', aliases: ['creatina'], summary: '', cautions: 'Puede retener agua.', watch_terms: ['riñón', 'renal'], always_consult: true },
  { slug: 'caf', aliases: ['cafeína'], summary: '', cautions: 'Afecta el sueño.', watch_terms: ['ansiedad', 'hipertensión'], always_consult: false },
];
assert.equal(findKnowledge('Creatina monohidrato', kb)?.slug, 'creatine');
assert.equal(findKnowledge('Cafeina', kb)?.slug, 'caf', 'sin tildes');
assert.equal(findKnowledge('xy', kb), null);
assert.equal(findKnowledge('Ashwagandha', kb), null);
let w = warningsFor(kb[1], 'losartán', 'Hipertensión leve', true);
assert.ok(w.some((x) => x.level === 'consult' && x.text.includes('hipertensión')));
w = warningsFor(kb[1], '', '', true);
assert.ok(!w.some((x) => x.level === 'consult')); assert.ok(w.some((x) => x.level === 'info'));
w = warningsFor(kb[0], null, null, false);
assert.ok(w.filter((x) => x.level === 'consult').length === 2, 'sin datos de salud + siempre consultar');
w = warningsFor(null, null, null, true);
assert.equal(w[0].level, 'consult', 'suplemento desconocido => consultar');

// Cálculos de Etapa 1 (no cubiertos antes)
assert.equal(hydrationTargetMl(60), 2100); assert.equal(hydrationTargetMl(200), 4000); assert.equal(hydrationTargetMl(30), 1500); assert.equal(hydrationTargetMl(null), null);
assert.equal(parseDate('25/03/1994'), '1994-03-25'); assert.equal(parseDate('31/02/1994'), null); assert.equal(parseDate('01/01/2999'), null);
assert.equal(ageFrom('1994-03-25', new Date(2026, 2, 24)), 31); assert.equal(ageFrom('1994-03-25', new Date(2026, 2, 25)), 32);
assert.equal(num('72,5'), 72.5); assert.equal(num(''), null); assert.deepEqual(csv('a, b,,a'), ['a', 'b']); assert.ok(validTime('08:05') && !validTime('8:5') && !validTime('24:00'));
console.log('app-logic: todo OK');
