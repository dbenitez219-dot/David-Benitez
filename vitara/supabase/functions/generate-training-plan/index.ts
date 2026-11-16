import { authenticate, callClaude, HttpError, rateLimit, SAFETY_RULES, userContext, wrap } from '../_shared/ai.ts';
import { availableEquipment, extractJson, usable, validateTrainingPlan, type CatalogEx } from '../_shared/safety.ts';

const GOALS: Record<string, string> = { lose_fat: 'bajar grasa', gain_muscle: 'ganar masa muscular', glutes_legs: 'aumentar glúteos y piernas', arms_back: 'desarrollar brazos y espalda', endurance: 'mejorar resistencia', fitness: 'mejorar condición física', maintain: 'mantener el peso', habits: 'mejorar hábitos y bienestar' };
const LEVEL: Record<string, string> = { none: 'principiante absoluto', beginner: 'principiante', intermediate: 'intermedio', advanced: 'avanzado' };

Deno.serve(wrap(async (req) => {
  const ctx = await authenticate(req);
  await rateLimit(ctx, 'training_plan', 6);
  const { profile, prefs, health, consent } = await userContext(ctx);

  const { data: cat } = await ctx.admin.from('exercises').select('id,name,kind,muscle,equipment,level,unit');
  const { data: ex } = await ctx.admin.from('exercise_exclusions').select('exercise_id').eq('user_id', ctx.userId);
  const excluded = new Set((ex ?? []).map((e: { exercise_id: string }) => e.exercise_id));
  const eq = availableEquipment(prefs.training_place, prefs.equipment);
  const catalog = (cat ?? []) as (CatalogEx & { name: string; muscle: string; unit: string })[];
  const options = catalog.filter((c) => c.kind === 'mobility' || usable(c, eq, excluded));

  const age = new Date().getUTCFullYear() - Number(String(profile.birth_date).slice(0, 4));
  const system = `Eres un entrenador personal profesional. Diseñas planes semanales seguros y progresivos.\n${SAFETY_RULES}\nDevuelves SOLO un objeto JSON válido, sin texto adicional.`;
  const user = `Crea el plan semanal de entrenamiento para esta persona.
Perfil: ${age} años, sexo ${profile.biological_sex ?? 'n/d'}, ${profile.height_cm} cm, ${profile.weight_kg} kg.
Objetivos: ${(prefs.goals as string[]).map((g) => GOALS[g] ?? g).join(', ') || 'bienestar general'}.
Experiencia: ${LEVEL[prefs.training_experience] ?? 'principiante'}. Actividad: ${prefs.activity_level}.
Lugar: ${prefs.training_place}. Duración por sesión: ${prefs.session_minutes} min.
Días de entrenamiento (1=lunes … 7=domingo): ${(prefs.training_days as number[]).join(', ')}. Los demás días son de descanso.
${consent ? `Lesiones: ${health.injuries ?? 'ninguna'}. Condiciones: ${health.conditions ?? 'ninguna'}. Medicación: ${health.medications ?? 'ninguna'}. Evita ejercicios que agraven estos puntos.` : 'Sin datos de salud autorizados: usa una selección conservadora.'}

Usa EXCLUSIVAMENTE ejercicios de esta lista (id|nombre|tipo|músculo|nivel|unidad):
${options.map((o) => `${o.id}|${o.name}|${o.kind}|${o.muscle}|${o.level}|${o.unit}`).join('\n')}

Reglas:
- Exactamente 7 días (weekday 1..7). Días de entrenamiento: kind "training" con 4-7 ejercicios principales (no uses ejercicios de tipo mobility como principales). Días de descanso: kind "rest" con "exercises": [].
- Cada sesión incluye "warmup" (2-4 ejercicios mobility o cardio suave, con seconds) y "cooldown" (1-3 mobility).
- Adapta al nivel: principiantes 2-3 series y 10-15 reps; intermedios 3-4 series. Para ejercicios en segundos (unit seconds) o minutos (unit minutes) usa reps_min/reps_max como segundos o minutos.
- Prioriza los objetivos sin descuidar equilibrio muscular. No repitas el mismo grupo muscular intenso en días consecutivos.
- rest_sec entre 30 y 180.
Formato:
{"rationale":"2-3 frases explicando el enfoque","week":[{"weekday":1,"kind":"training","title":"...","warmup":[{"exercise_id":"...","seconds":40}],"exercises":[{"exercise_id":"...","sets":3,"reps_min":8,"reps_max":12,"rest_sec":90,"notes":"opcional"}],"cooldown":[{"exercise_id":"...","seconds":40}]}]}`;

  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callClaude({ system, maxTokens: 12000, messages: [{ role: 'user', content: attempt ? `${user}\n\nTu intento anterior tuvo estos errores, corrígelos: ${lastErrors.join(', ')}` : user }] });
    let raw: unknown;
    try { raw = extractJson(text); } catch { lastErrors = ['json_invalido']; continue; }
    const { plan, errors } = validateTrainingPlan(raw, catalog, eq, excluded, prefs.training_days as number[]);
    if (errors.length) { lastErrors = errors; continue; }
    await ctx.admin.from('workout_plans').update({ active: false }).eq('user_id', ctx.userId).eq('active', true);
    const rationale = typeof (raw as { rationale?: unknown }).rationale === 'string' ? ((raw as { rationale: string }).rationale).slice(0, 600) : null;
    const { data, error } = await ctx.admin.from('workout_plans').insert({ user_id: ctx.userId, week: plan, rationale }).select('id').single();
    if (error) throw new HttpError(500, 'save_failed');
    return { plan_id: data.id };
  }
  throw new HttpError(422, 'plan_invalid', `No se pudo generar un plan válido (${lastErrors.slice(0, 3).join(', ')}). Reintentá.`);
}));
