import { authenticate, callClaude, HttpError, rateLimit, SAFETY_RULES, userContext, wrap, type Msg } from '../_shared/ai.ts';

Deno.serve(wrap(async (req) => {
  const ctx = await authenticate(req);
  const body = await req.json().catch(() => ({}));
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages: Msg[] = incoming.slice(-12)
    .filter((m: { role?: string; content?: unknown }) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw new HttpError(400, 'bad_messages');
  await rateLimit(ctx, 'coach_chat', 80);

  const { profile, prefs, health, consent } = await userContext(ctx);
  let exerciseCtx = '';
  if (typeof body.exercise_id === 'string') {
    const { data: ex } = await ctx.admin.from('exercises').select('name,muscle,instructions,tips').eq('id', body.exercise_id).maybeSingle();
    if (ex) exerciseCtx = `\nEjercicio actual: ${ex.name} (${ex.muscle}). Técnica: ${ex.instructions.join(' ')} ${ex.tips ?? ''}`;
  }
  const age = new Date().getUTCFullYear() - Number(String(profile.birth_date).slice(0, 4));
  const system = `Eres el entrenador personal de esta persona y respondes durante su entrenamiento, como lo haría un entrenador real: cercano, concreto y breve (máx. 5 frases).
${SAFETY_RULES}
Perfil: ${age} años, ${profile.weight_kg} kg, objetivos ${(prefs.goals as string[]).join(', ')}, experiencia ${prefs.training_experience}, entrena en ${prefs.training_place}.
${consent ? `Lesiones: ${health.injuries ?? 'ninguna'}. Condiciones: ${health.conditions ?? 'ninguna'}.` : ''}${exerciseCtx}
Si pregunta si debe cambiar un ejercicio por dolor o molestia: recomienda parar y, si persiste, ver a un profesional; sugiere una alternativa suave.`;
  const reply = await callClaude({ system, messages, maxTokens: 700, effort: 'low' });
  return { reply };
}));
