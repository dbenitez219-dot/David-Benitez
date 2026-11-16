import { authenticate, callClaude, HttpError, rateLimit, SAFETY_RULES, userContext, wrap } from '../_shared/ai.ts';
import { computeTargets, extractJson, validateNutritionPlan } from '../_shared/safety.ts';

const GOALS: Record<string, string> = { lose_fat: 'bajar grasa', gain_muscle: 'ganar masa muscular', glutes_legs: 'glúteos y piernas', arms_back: 'brazos y espalda', endurance: 'resistencia', fitness: 'condición física', maintain: 'mantener peso', habits: 'hábitos saludables' };

Deno.serve(wrap(async (req) => {
  const ctx = await authenticate(req);
  await rateLimit(ctx, 'nutrition_plan', 6);
  const { profile, prefs, health, consent } = await userContext(ctx);

  // Metas calculadas por código (con pisos de seguridad); la IA solo arma el menú alrededor de ellas.
  let targets;
  try { targets = computeTargets(profile, prefs); } catch { throw new HttpError(409, 'profile_incomplete'); }

  const { data: stats } = await ctx.admin.from('user_food_stats').select('food_name,times').eq('user_id', ctx.userId).order('times', { ascending: false }).limit(15);
  const learned = (stats ?? []).map((s: { food_name: string }) => s.food_name);
  const allergies: string[] = consent ? health.allergies : [];
  const restrictions: string[] = consent ? health.dietary_restrictions : [];
  const mt = prefs.meal_times as Record<string, string>;

  const system = `Eres un nutricionista profesional. Diseñas planes de alimentación equilibrados, realistas y económicos.\n${SAFETY_RULES}\nDevuelves SOLO un objeto JSON válido, sin texto adicional.`;
  const user = `Crea un plan de alimentación de 7 días.
Metas diarias (obligatorias, calculadas): ${targets.kcal} kcal, proteínas ${targets.protein_g} g, carbohidratos ${targets.carbs_g} g, grasas ${targets.fat_g} g. Cada día debe quedar dentro de ±5 % de las kcal.
Objetivos: ${(prefs.goals as string[]).map((g) => GOALS[g] ?? g).join(', ') || 'bienestar'}.
Zona horaria (úsala para inferir país y alimentos habituales y fáciles de conseguir allí): ${prefs.timezone}.
Alimentos preferidos: ${(prefs.favorite_foods as string[]).join(', ') || 'sin datos'}. Alimentos que realmente registra con frecuencia: ${learned.join(', ') || 'sin datos aún'}.
Alergias (PROHIBIDO incluirlas, ni trazas): ${allergies.join(', ') || 'ninguna declarada'}. Restricciones: ${restrictions.join(', ') || 'ninguna'}.
Comidas por día: breakfast (${mt.breakfast}), lunch (${mt.lunch}), snack (${mt.snack}), dinner (${mt.dinner}).
Entrena ${(prefs.training_days as number[]).length} días por semana.

Reglas: porciones en gramos realistas; ingredientes baratos y comunes; recetas muy simples (máx. 3 frases); varía los días sin complicar; incluye fuente de proteína en cada comida principal; "shopping_list" semanal agrupada por categoría con cantidades aproximadas; "substitutions" con 5-8 equivalencias útiles; "notes" con 1-3 consejos.
Formato:
{"days":[{"day":1,"meals":[{"type":"breakfast","title":"...","items":[{"name":"...","grams":100,"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0}],"recipe":"..."}]}],"shopping_list":[{"category":"Verduras","items":["Tomate 1 kg"]}],"substitutions":[{"food":"Pollo","alternatives":["Pescado","Huevos"]}],"notes":["..."]}`;

  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callClaude({ system, maxTokens: 16000, messages: [{ role: 'user', content: attempt ? `${user}\n\nTu intento anterior tuvo estos errores, corrígelos: ${lastErrors.join(', ')}` : user }] });
    let raw: unknown;
    try { raw = extractJson(text); } catch { lastErrors = ['json_invalido']; continue; }
    const { plan, errors } = validateNutritionPlan(raw, targets, allergies);
    if (!plan || errors.length) { lastErrors = errors; continue; }
    await ctx.admin.from('nutrition_plans').update({ active: false }).eq('user_id', ctx.userId).eq('active', true);
    const { data, error } = await ctx.admin.from('nutrition_plans').insert({ user_id: ctx.userId, targets, plan }).select('id').single();
    if (error) throw new HttpError(500, 'save_failed');
    return { plan_id: data.id, targets };
  }
  throw new HttpError(422, 'plan_invalid', `No se pudo generar un plan válido (${lastErrors.slice(0, 3).join(', ')}). Reintentá.`);
}));
