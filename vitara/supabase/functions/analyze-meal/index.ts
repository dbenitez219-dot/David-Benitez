import { authenticate, callClaude, HttpError, rateLimit, SAFETY_RULES, userContext, wrap, type ContentBlock } from '../_shared/ai.ts';
import { extractJson, validateMealAnalysis } from '../_shared/safety.ts';

const MIME: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX_BYTES = 5 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let s = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

Deno.serve(wrap(async (req) => {
  const ctx = await authenticate(req);
  const body = await req.json().catch(() => ({}));
  const path = String(body.photo_path ?? '');
  const mealType = String(body.meal_type ?? '');
  // La foto debe estar en la carpeta del propio usuario: nadie puede analizar fotos ajenas.
  if (!path.startsWith(`${ctx.userId}/`) || path.includes('..')) throw new HttpError(403, 'forbidden_path');
  if (!['breakfast', 'lunch', 'snack', 'dinner'].includes(mealType)) throw new HttpError(400, 'bad_meal_type');
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (!MIME[ext]) throw new HttpError(400, 'bad_image_type');
  await rateLimit(ctx, 'analyze_meal', 40);

  const { data: file, error } = await ctx.admin.storage.from('meal-photos').download(path);
  if (error || !file) throw new HttpError(404, 'photo_not_found');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new HttpError(413, 'photo_too_large', 'La foto es demasiado grande.');

  const { prefs, health, consent } = await userContext(ctx);
  const { data: stats } = await ctx.admin.from('user_food_stats').select('food_name').eq('user_id', ctx.userId).order('times', { ascending: false }).limit(10);
  const known = (stats ?? []).map((s: { food_name: string }) => s.food_name);

  const system = `Eres un nutricionista que estima el contenido de una comida a partir de una foto.\n${SAFETY_RULES}
Reglas específicas del análisis:
- Identifica SOLO lo que se ve con claridad. Nunca inventes ingredientes ni cantidades. Si algo no es identificable, ponlo en "unidentified" y no lo sumes.
- Si la imagen no muestra comida, devuelve "identified": false y "items": [].
- Estima gramos solo cuando haya referencias visuales razonables (plato, cubiertos, mano); si no, "grams": null y confianza "low".
- Los datos de preferencias del usuario sirven solo para desambiguar nombres; jamás para añadir alimentos que no se ven.
- Indica tu incertidumbre global en "uncertainty_pct" (una estimación visual rara vez baja del 15 %).
Devuelves SOLO un objeto JSON válido.`;
  const text = `Analiza esta comida (${mealType}). Alimentos que el usuario suele registrar (solo para nombrar mejor): ${known.join(', ') || 'sin datos'}.
Formato: {"identified":true,"items":[{"name":"...","grams":150,"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"confidence":"high|medium|low"}],"unidentified":["..."],"uncertainty_pct":25,"comment":"1-2 frases neutrales y útiles"}`;
  const content: ContentBlock[] = [
    { type: 'image', source: { type: 'base64', media_type: MIME[ext], data: toBase64(bytes) } },
    { type: 'text', text },
  ];

  const out = await callClaude({ system, maxTokens: 2500, effort: 'low', messages: [{ role: 'user', content }] });
  let analysis;
  try { analysis = validateMealAnalysis(extractJson(out)); } catch { throw new HttpError(502, 'bad_ai_output', 'No pude interpretar la foto. Reintentá o corregí manualmente.'); }

  // Aviso de alérgenos declarados (solo si el usuario autorizó datos de salud).
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const allergens: string[] = consent ? health.allergies : [];
  const allergen_hits = analysis.items.filter((i) => allergens.some((a) => a && norm(i.name).includes(norm(a)))).map((i) => i.name);
  void prefs;
  return { analysis, allergen_hits };
}));
