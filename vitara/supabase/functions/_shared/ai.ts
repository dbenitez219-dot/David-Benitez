// Utilidades compartidas de las Edge Functions: autenticación, límites de uso, llamada a Claude.
// Las claves (ANTHROPIC_API_KEY, service role) viven solo aquí, como secrets del servidor.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) { super(message ?? code); }
}

export type Ctx = { userId: string; admin: SupabaseClient; user: SupabaseClient };

/** Verifica el JWT del usuario y devuelve un cliente con sus permisos (RLS) y otro con service role. */
export async function authenticate(req: Request): Promise<Ctx> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) throw new HttpError(401, 'unauthenticated');
  const url = Deno.env.get('SUPABASE_URL')!;
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await user.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new HttpError(401, 'unauthenticated');
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  return { userId: data.user.id, admin, user };
}

/** Límite de uso por usuario y por función (protege el costo de IA). */
export async function rateLimit(ctx: Ctx, fn: string, maxPerDay: number) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await ctx.admin.from('ai_usage').select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId).eq('fn', fn).gte('created_at', since);
  if ((count ?? 0) >= maxPerDay) throw new HttpError(429, 'rate_limited', 'Alcanzaste el límite diario de esta función.');
  await ctx.admin.from('ai_usage').insert({ user_id: ctx.userId, fn });
}

// Modelo por tipo de tarea (se pueden cambiar con secrets sin tocar código).
export const MODELS = {
  plans: Deno.env.get('MODEL_PLANS') ?? 'claude-opus-5-5',   // pocas veces por semana, salida larga y delicada
  chat: Deno.env.get('MODEL_CHAT') ?? 'claude-sonnet-5-5',   // uso frecuente, más barato
  meal: Deno.env.get('MODEL_MEAL') ?? 'claude-sonnet-5-5',   // solo si el usuario pide analizar una foto
};
let client: Anthropic | null = null;

export type ContentBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } };
export type Msg = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

export async function callClaude(opts: { model: string; system: string; messages: Msg[]; maxTokens?: number; effort?: 'low' | 'medium' | 'high' }): Promise<string> {
  client ??= new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  const params: Record<string, unknown> = {
    model: opts.model, max_tokens: opts.maxTokens ?? 8000, system: opts.system, messages: opts.messages,
    output_config: { effort: opts.effort ?? 'medium' },
  };
  // Reintento automático en un modelo alternativo si un clasificador de seguridad rechaza la petición.
  if (opts.model === 'claude-opus-5-5' || opts.model === 'claude-sonnet-5-5') { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
  // deno-lint-ignore no-explicit-any
  const res: any = await (client.beta.messages as any).create(params);
  if (res.stop_reason === 'refusal') throw new HttpError(422, 'ai_refused', 'La IA no pudo responder a esta solicitud.');
  if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'ai_truncated', 'La respuesta de la IA quedó incompleta. Reintentá.');
  // deno-lint-ignore no-explicit-any
  return res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}

export function wrap(handler: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      return json(await handler(req));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error('fn_error', e instanceof Error ? e.message : String(e)); // sin volcar datos del usuario
      return json({ error: 'internal', message: 'Error interno.' }, 500);
    }
  };
}

/** Datos del usuario para el prompt. NO incluye nombre ni correo. Los datos de salud solo si hay consentimiento. */
export async function userContext(ctx: Ctx) {
  const [p, pr, h] = await Promise.all([
    ctx.admin.from('profiles').select('*').eq('id', ctx.userId).single(),
    ctx.admin.from('preferences').select('*').eq('user_id', ctx.userId).single(),
    ctx.admin.from('health_profiles').select('*').eq('user_id', ctx.userId).single(),
  ]);
  if (p.error || pr.error || h.error) throw new HttpError(500, 'profile_load_failed');
  const profile = p.data, prefs = pr.data, health = h.data;
  if (!profile.onboarding_completed_at) throw new HttpError(409, 'onboarding_incomplete', 'Completá la evaluación inicial primero.');
  const consent = !!health.health_consent_at;
  return { profile, prefs, health, consent };
}

export const SAFETY_RULES = `Reglas de seguridad obligatorias:
- Eres una herramienta de bienestar, no un profesional sanitario. No diagnostiques ni prescribas tratamientos ni suplementos.
- Nunca recomiendes dietas extremas, ayunos prolongados, purgas, ni calorías por debajo de lo indicado.
- Ante dolor agudo, mareos, dolor de pecho, lesiones o condiciones médicas relevantes: indica parar y consultar a un profesional.
- Distingue claramente entre información general y lo que requiere un profesional de la salud.
- No inventes datos. Si no estás seguro, dilo.
- Responde en español rioplatense neutro, claro y breve.`;
