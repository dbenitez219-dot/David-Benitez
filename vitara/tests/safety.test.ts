import assert from 'node:assert/strict';
import { computeTargets, validateNutritionPlan, validateTrainingPlan, validateMealAnalysis, extractJson, availableEquipment } from '../supabase/functions/_shared/safety.ts';

const now = new Date('2026-11-16T12:00:00Z');
// Mujer 30a, 165cm, 60kg, bajar grasa
let t = computeTargets({ biological_sex: 'female', birth_date: '1996-01-01', height_cm: 165, weight_kg: 60, target_weight_kg: 55 }, { goals: ['lose_fat'], activity_level: 'moderate' }, now);
assert.ok(t.kcal >= 1200 && t.kcal < t.tdee, 'déficit moderado'); assert.ok(t.kcal / t.tdee >= 0.84);
// piso de seguridad: persona pequeña y sedentaria
t = computeTargets({ biological_sex: 'female', birth_date: '1970-01-01', height_cm: 150, weight_kg: 45, target_weight_kg: 42 }, { goals: ['lose_fat'], activity_level: 'sedentary' }, now);
assert.ok(t.kcal >= 1200, 'piso 1200');
// menor: sin déficit
t = computeTargets({ biological_sex: 'male', birth_date: '2010-01-01', height_cm: 170, weight_kg: 65, target_weight_kg: 60 }, { goals: ['lose_fat'], activity_level: 'moderate' }, now);
assert.ok(t.flags.includes('minor') && t.kcal >= t.tdee - 10, 'menor sin déficit');
// bajo peso: sin déficit
t = computeTargets({ biological_sex: 'female', birth_date: '1996-01-01', height_cm: 170, weight_kg: 50, target_weight_kg: 47 }, { goals: ['lose_fat'], activity_level: 'light' }, now);
assert.ok(t.flags.includes('low_bmi') && t.kcal >= t.tdee - 10);
assert.throws(() => computeTargets({ biological_sex: null, birth_date: null, height_cm: null, weight_kg: null, target_weight_kg: null }, { goals: [], activity_level: null }, now));

// extractJson
assert.deepEqual(extractJson('texto ```json\n{"a":1}\n``` fin'), { a: 1 });
assert.deepEqual(extractJson('{"a":2}'), { a: 2 });
assert.throws(() => extractJson('sin json'));

// nutrición: alérgeno descartado, totales recalculados
const tg = { ...t, kcal: 1000 };
const mk = (name: string, k: number) => ({ name, grams: 100, kcal: k, protein_g: 10, carbs_g: 20, fat_g: 5 });
const day = (n: number, extra = '') => ({ day: n, meals: ['breakfast', 'lunch', 'dinner'].map((ty) => ({ type: ty, title: ty, items: [mk('arroz', 200), mk(extra || 'pollo', 133)] })) });
let r = validateNutritionPlan({ days: [day(1), day(2), day(3, 'Maní tostado')] }, tg, ['mani']);
assert.ok(r.errors.some((e) => e.startsWith('allergen:')), 'alérgeno detectado (sin tildes)');
r = validateNutritionPlan({ days: [day(1), day(2), day(3)] }, tg, []);
assert.equal(r.plan!.days[0].totals.kcal, 999); assert.equal(r.errors.length, 0);
r = validateNutritionPlan({ days: [day(1), day(2), { day: 3, meals: [{ type: 'lunch', title: 'x', items: [mk('a', 3000)] }] }] }, tg, []);
assert.ok(r.errors.some((e) => e.includes('kcal_off')));

// entrenamiento
const cat = [
  { id: 'squat_bw', kind: 'strength', equipment: [], level: 'beginner' }, { id: 'pushup', kind: 'strength', equipment: [], level: 'intermediate' },
  { id: 'plank', kind: 'core', equipment: [], level: 'beginner' }, { id: 'bb_bench', kind: 'strength', equipment: ['barbell', 'bench'], level: 'intermediate' },
  { id: 'cat_cow', kind: 'mobility', equipment: [], level: 'beginner' },
];
const eq = availableEquipment('home', []);
const ex = (id: string) => ({ exercise_id: id, sets: 3, reps_min: 8, reps_max: 12, rest_sec: 60 });
const week = [1, 2, 3, 4, 5, 6, 7].map((wd) => wd <= 5
  ? { weekday: wd, kind: 'training', title: 'T', warmup: [{ exercise_id: 'cat_cow', seconds: 30 }], exercises: [ex('squat_bw'), ex('pushup'), ex('plank'), ex('bb_bench')], cooldown: [] }
  : { weekday: wd, kind: 'rest', title: 'R', exercises: [] });
let v = validateTrainingPlan({ week }, cat, eq, new Set(), [1, 2, 3, 4, 5]);
assert.equal(v.errors.length, 0); assert.equal(v.plan[0].exercises.length, 3, 'press de banca descartado: sin barra en casa');
v = validateTrainingPlan({ week }, cat, eq, new Set(['pushup']), [1, 2, 3, 4, 5]);
assert.equal(v.plan[0].exercises.length, 2); assert.ok(v.errors.includes('day_1_too_few_exercises'));
v = validateTrainingPlan({ week }, cat, eq, new Set(), [1, 2, 3, 4]); // el viernes ahora es descanso
assert.ok(v.errors.includes('day_5_kind_mismatch'));
assert.equal(validateTrainingPlan({}, cat, eq, new Set(), [1]).errors[0], 'week_missing');

// comida
const a = validateMealAnalysis({ items: [{ name: 'arroz', grams: 150, kcal: 200, protein_g: 4, carbs_g: 44, fat_g: 0.4, confidence: 'high' }, { name: 'salsa', kcal: 80, confidence: 'low' }], uncertainty_pct: 5 });
assert.equal(a.totals.kcal, 280); assert.ok(a.uncertainty_pct >= 15, 'incertidumbre mínima 15%'); assert.equal(a.items[1].grams, null);
assert.equal(validateMealAnalysis({ items: [] }).identified, false);
assert.equal(validateMealAnalysis({ items: [{ name: 'x', kcal: 99999 }] }).items[0].kcal, 2500);
console.log('safety: todo OK');
