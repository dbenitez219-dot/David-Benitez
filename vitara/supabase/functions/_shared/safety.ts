// Lógica determinista de seguridad. La IA propone; este código calcula metas y valida todo lo que la IA devuelve.
// Sin dependencias para poder probarlo con Node y ejecutarlo en Deno.

export type ProfileIn = {
  biological_sex: string | null; birth_date: string | null; height_cm: number | null; weight_kg: number | null; target_weight_kg: number | null;
};
export type PrefsIn = { goals: string[]; activity_level: string | null };

export type Targets = {
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; water_ml: number; bmr: number; tdee: number;
  notes: string[]; flags: string[];
};

const ACTIVITY: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, athlete: 1.9 };

export function ageOn(birthIso: string, now = new Date()): number {
  const [y, m, d] = birthIso.split('-').map(Number);
  let a = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) a--;
  return a;
}

/** Metas orientativas. Nunca por debajo de un piso seguro; sin déficit para menores o bajo peso. */
export function computeTargets(p: ProfileIn, prefs: PrefsIn, now = new Date()): Targets {
  if (!p.birth_date || !p.height_cm || !p.weight_kg) throw new Error('profile_incomplete');
  const age = ageOn(p.birth_date, now);
  const w = p.weight_kg, h = p.height_cm;
  const sexAdj = p.biological_sex === 'male' ? 5 : p.biological_sex === 'female' ? -161 : -78;
  const bmr = 10 * w + 6.25 * h - 5 * age + sexAdj;
  const tdee = bmr * (ACTIVITY[prefs.activity_level ?? 'light'] ?? 1.375);
  const bmi = w / Math.pow(h / 100, 2);
  const notes: string[] = [], flags: string[] = [];

  const lose = prefs.goals.includes('lose_fat'), gain = prefs.goals.includes('gain_muscle');
  let factor = 1;
  if (lose && gain) factor = 0.95;
  else if (lose) factor = 0.85;
  else if (gain) factor = 1.08;

  if (age < 18) { if (factor < 1) factor = 1; flags.push('minor'); notes.push('Al ser menor de 18 años no se aplica déficit calórico: consulta a un profesional de la salud.'); }
  if (bmi < 18.5 && factor < 1) { factor = 1; flags.push('low_bmi'); notes.push('Tu IMC está bajo el rango habitual: no se aplica déficit. Consulta a un profesional.'); }
  if (age < 18 || bmi < 18.5 || bmi >= 40) flags.push('consult_professional');

  const floor = p.biological_sex === 'male' ? 1500 : 1200;
  let kcal = tdee * factor;
  if (kcal < floor) { kcal = floor; notes.push(`Se aplicó un mínimo de seguridad de ${floor} kcal/día.`); }
  kcal = Math.round(kcal / 10) * 10;

  const protPerKg = lose || gain ? 1.8 : 1.4;
  const protein = Math.round(Math.min(w * protPerKg, w * 2.2));
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const water = Math.round(Math.min(4000, Math.max(1500, w * 35)) / 50) * 50;
  return { kcal, protein_g: protein, carbs_g: carbs, fat_g: fat, water_ml: water, bmr: Math.round(bmr), tdee: Math.round(tdee), notes, flags };
}

// ───────────── Utilidades de salida de IA ─────────────
export function extractJson(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fence ? fence[1] : text;
  const start = body.indexOf('{'), end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no_json');
  return JSON.parse(body.slice(start, end + 1));
}
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ───────────── Plan de entrenamiento ─────────────
export type CatalogEx = { id: string; kind: string; equipment: string[]; level: string };
export type DayPlan = {
  weekday: number; kind: 'training' | 'rest'; title: string;
  warmup: { exercise_id: string; seconds: number }[]; cooldown: { exercise_id: string; seconds: number }[];
  exercises: { exercise_id: string; sets: number; reps_min: number; reps_max: number; rest_sec: number; notes?: string }[];
};

export function availableEquipment(place: string | null, equipment: string[]): Set<string> {
  const all = ['dumbbells', 'bands', 'barbell', 'machines', 'kettlebell', 'bench', 'pullup'];
  if (place === 'gym') return new Set(all);
  const s = new Set(equipment);
  if (place === 'both') all.forEach((e) => s.has(e) || s.add(e)); // en gimnasio hay de todo
  return s;
}
export function usable(ex: CatalogEx, eq: Set<string>, excluded: Set<string>): boolean {
  return !excluded.has(ex.id) && ex.equipment.every((e) => eq.has(e));
}

export function validateTrainingPlan(raw: unknown, catalog: CatalogEx[], eq: Set<string>, excluded: Set<string>, trainingDays: number[]): { plan: DayPlan[]; errors: string[] } {
  const errors: string[] = [];
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const week = (raw as any)?.week;
  if (!Array.isArray(week)) return { plan: [], errors: ['week_missing'] };
  const out: DayPlan[] = [];
  for (let wd = 1; wd <= 7; wd++) {
    const d = week.find((x: any) => x?.weekday === wd);
    const shouldTrain = trainingDays.includes(wd);
    if (!d) { errors.push(`day_${wd}_missing`); continue; }
    const kind = shouldTrain ? 'training' : 'rest';
    if (d.kind !== kind) errors.push(`day_${wd}_kind_mismatch`);
    const mobilityOk = (arr: any): { exercise_id: string; seconds: number }[] =>
      (Array.isArray(arr) ? arr : []).filter((m) => byId.get(m?.exercise_id)?.kind === 'mobility' || byId.get(m?.exercise_id)?.kind === 'cardio')
        .map((m) => ({ exercise_id: m.exercise_id, seconds: clamp(isNum(m.seconds) ? Math.round(m.seconds) : 30, 15, 600) }));
    const exercises: DayPlan['exercises'] = [];
    if (shouldTrain) {
      for (const e of Array.isArray(d.exercises) ? d.exercises : []) {
        const ex = byId.get(e?.exercise_id);
        if (!ex) { errors.push(`unknown_exercise:${e?.exercise_id}`); continue; }
        if (!usable(ex, eq, excluded)) { errors.push(`not_usable:${ex.id}`); continue; }
        if (ex.kind === 'mobility') { errors.push(`mobility_in_main:${ex.id}`); continue; }
        const sets = isNum(e.sets) ? Math.round(e.sets) : NaN, rmin = Math.round(e.reps_min), rmax = Math.round(e.reps_max);
        if (!(sets >= 1 && sets <= 6) || !(rmin >= 1 && rmax >= rmin && rmax <= 100)) { errors.push(`bad_volume:${ex.id}`); continue; }
        exercises.push({ exercise_id: ex.id, sets, reps_min: rmin, reps_max: rmax, rest_sec: clamp(isNum(e.rest_sec) ? Math.round(e.rest_sec) : 60, 20, 300), notes: isStr(e.notes) ? e.notes.slice(0, 200) : undefined });
      }
      if (exercises.length < 3) errors.push(`day_${wd}_too_few_exercises`);
      if (exercises.length > 10) exercises.length = 10;
    }
    out.push({ weekday: wd, kind, title: isStr(d.title) ? d.title.slice(0, 80) : (shouldTrain ? 'Entrenamiento' : 'Descanso'), warmup: mobilityOk(d.warmup), cooldown: mobilityOk(d.cooldown), exercises });
  }
  // Los ejercicios inválidos se descartan (la IA no puede colar ejercicios inexistentes, sin equipo o excluidos);
  // si por eso un día queda con menos de 3, ya consta `too_few_exercises` y el plan se reintenta o se rechaza.
  const discard = ['unknown_exercise', 'not_usable', 'bad_volume', 'mobility_in_main'];
  return { plan: out, errors: errors.filter((e) => !discard.some((d) => e.startsWith(d))) };
}

// ───────────── Plan de nutrición ─────────────
export type MealItem = { name: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number };
export type PlannedMeal = { type: string; title: string; items: MealItem[]; recipe?: string };
export type NutritionPlan = {
  days: { day: number; meals: PlannedMeal[]; totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } }[];
  shopping_list: { category: string; items: string[] }[]; substitutions: { food: string; alternatives: string[] }[]; notes: string[];
};
const MEAL_TYPES = ['breakfast', 'lunch', 'snack', 'dinner'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function validateNutritionPlan(raw: unknown, t: Targets, allergies: string[]): { plan: NutritionPlan | null; errors: string[] } {
  const errors: string[] = [];
  const days = (raw as any)?.days;
  if (!Array.isArray(days) || days.length < 3) return { plan: null, errors: ['days_missing'] };
  const bad = allergies.map(norm).filter(Boolean);
  const outDays: NutritionPlan['days'] = [];
  for (const d of days.slice(0, 7)) {
    const meals: PlannedMeal[] = [];
    for (const m of Array.isArray(d?.meals) ? d.meals : []) {
      if (!MEAL_TYPES.includes(m?.type)) continue;
      const items: MealItem[] = [];
      for (const it of Array.isArray(m.items) ? m.items : []) {
        if (!isStr(it?.name) || ![it.grams, it.kcal, it.protein_g, it.carbs_g, it.fat_g].every(isNum)) continue;
        if (bad.some((a) => norm(it.name).includes(a))) { errors.push(`allergen:${it.name}`); continue; }
        items.push({ name: it.name.slice(0, 80), grams: clamp(it.grams, 1, 2000), kcal: clamp(it.kcal, 0, 2000), protein_g: clamp(it.protein_g, 0, 200), carbs_g: clamp(it.carbs_g, 0, 400), fat_g: clamp(it.fat_g, 0, 200) });
      }
      if (items.length) meals.push({ type: m.type, title: isStr(m.title) ? m.title.slice(0, 80) : '', items, recipe: isStr(m.recipe) ? m.recipe.slice(0, 800) : undefined });
    }
    const sum = (k: keyof MealItem) => Math.round(meals.reduce((a, m) => a + m.items.reduce((b, i) => b + (i[k] as number), 0), 0));
    const totals = { kcal: sum('kcal'), protein_g: sum('protein_g'), carbs_g: sum('carbs_g'), fat_g: sum('fat_g') };
    // Totales recalculados por nosotros; no se confía en los de la IA.
    if (totals.kcal < t.kcal * 0.85 || totals.kcal > t.kcal * 1.15) errors.push(`day_${d?.day}_kcal_off:${totals.kcal}`);
    if (meals.length < 3) errors.push(`day_${d?.day}_few_meals`);
    outDays.push({ day: Number(d?.day) || outDays.length + 1, meals, totals });
  }
  const strArr = (x: unknown) => (Array.isArray(x) ? x.filter(isStr).map((s) => s.slice(0, 80)) : []);
  const plan: NutritionPlan = {
    days: outDays,
    shopping_list: (Array.isArray((raw as any).shopping_list) ? (raw as any).shopping_list : []).map((g: any) => ({ category: isStr(g?.category) ? g.category.slice(0, 40) : 'Otros', items: strArr(g?.items) })).filter((g: any) => g.items.length),
    substitutions: (Array.isArray((raw as any).substitutions) ? (raw as any).substitutions : []).map((s: any) => ({ food: isStr(s?.food) ? s.food.slice(0, 60) : '', alternatives: strArr(s?.alternatives) })).filter((s: any) => s.food && s.alternatives.length),
    notes: strArr((raw as any).notes),
  };
  return { plan, errors };
}

// ───────────── Análisis de comida por foto ─────────────
export type MealAnalysis = {
  identified: boolean; items: { name: string; grams: number | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number; confidence: 'high' | 'medium' | 'low' }[];
  uncertainty_pct: number; unidentified: string[]; comment: string; totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
};
export function validateMealAnalysis(raw: unknown): MealAnalysis {
  const r = raw as any;
  const items: MealAnalysis['items'] = [];
  for (const it of Array.isArray(r?.items) ? r.items : []) {
    if (!isStr(it?.name) || !isNum(it.kcal)) continue;
    items.push({
      name: it.name.slice(0, 80), grams: isNum(it.grams) ? clamp(it.grams, 1, 2000) : null,
      kcal: clamp(it.kcal, 0, 2500), protein_g: clamp(isNum(it.protein_g) ? it.protein_g : 0, 0, 200),
      carbs_g: clamp(isNum(it.carbs_g) ? it.carbs_g : 0, 0, 400), fat_g: clamp(isNum(it.fat_g) ? it.fat_g : 0, 0, 200),
      confidence: ['high', 'medium', 'low'].includes(it.confidence) ? it.confidence : 'low',
    });
  }
  const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') => Math.round(items.reduce((a, i) => a + i[k], 0) * 10) / 10;
  const lowShare = items.length ? items.filter((i) => i.confidence === 'low').length / items.length : 1;
  // Incertidumbre mínima razonable para estimación visual: 15 %; sube con poca confianza.
  const reported = isNum(r?.uncertainty_pct) ? clamp(Math.round(r.uncertainty_pct), 5, 80) : 30;
  const uncertainty = clamp(Math.max(reported, 15, Math.round(15 + lowShare * 35)), 15, 80);
  return {
    identified: items.length > 0 && r?.identified !== false, items, uncertainty_pct: uncertainty,
    unidentified: (Array.isArray(r?.unidentified) ? r.unidentified.filter(isStr) : []).slice(0, 10).map((s: string) => s.slice(0, 80)),
    comment: isStr(r?.comment) ? r.comment.slice(0, 400) : '',
    totals: { kcal: sum('kcal'), protein_g: sum('protein_g'), carbs_g: sum('carbs_g'), fat_g: sum('fat_g') },
  };
}
