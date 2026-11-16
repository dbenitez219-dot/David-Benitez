// Se ejecuta cada minuto (pg_cron + pg_net, ver supabase/cron.sql). Protegida con un secreto propio.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { DEFAULT_WATER_TIMES, MEAL_NAMES, isDue, isPaused, localParts } from '../_shared/reminders.ts';
import { cors, json } from '../_shared/ai.ts';

type Push = { to: string; title: string; body: string; sound: 'default'; data?: Record<string, unknown> };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET') || !Deno.env.get('CRON_SECRET')) return json({ error: 'forbidden' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const now = new Date();
  const { data: tokens } = await admin.from('push_tokens').select('token,user_id');
  const byUser = new Map<string, string[]>();
  for (const t of tokens ?? []) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);
  if (!byUser.size) return json({ sent: 0 });

  const ids = [...byUser.keys()];
  const [prefsQ, settingsQ, suppQ, profQ] = await Promise.all([
    admin.from('preferences').select('*').in('user_id', ids),
    admin.from('notification_settings').select('*').in('user_id', ids),
    admin.from('supplements').select('id,user_id,name,times').in('user_id', ids).eq('active', true),
    admin.from('profiles').select('id,weight_kg').in('id', ids),
  ]);
  const out: Push[] = [];

  for (const uid of ids) {
    const prefs = prefsQ.data?.find((p) => p.user_id === uid);
    if (!prefs) continue;
    const local = localParts(now, prefs.timezone);
    const setting = (c: string) => settingsQ.data?.find((s) => s.user_id === uid && s.category === c);
    const tokensOf = byUser.get(uid)!;
    const queue: { key: string; category: string; title: string; body: string }[] = [];
    const [mealsQ, waterQ, sessQ, intakeQ] = await Promise.all([
      admin.from('meal_logs').select('meal_type').eq('user_id', uid).eq('log_date', local.date),
      admin.from('water_logs').select('ml').eq('user_id', uid).eq('log_date', local.date),
      admin.from('workout_sessions').select('status').eq('user_id', uid).eq('session_date', local.date).eq('status', 'completed'),
      admin.from('supplement_intakes').select('supplement_id,time_slot').eq('user_id', uid).eq('taken_on', local.date),
    ]);

    if (!isPaused(setting('meals'), now)) {
      for (const [type, at] of Object.entries(prefs.meal_times as Record<string, string>)) {
        const logged = mealsQ.data?.some((m) => m.meal_type === type);
        if (isDue(local, at)) queue.push({ key: `meal:${type}`, category: 'meals', title: `Es hora de ${MEAL_NAMES[type] ?? 'comer'}`, body: 'Cuando termines, fotografiá tu comida para registrarla.' });
        else if (!logged && isDue(local, at, 25)) queue.push({ key: `mealphoto:${type}`, category: 'meals', title: 'No olvides fotografiar tu comida', body: 'Registrala con una foto o anotá una incidencia si no pudiste.' });
      }
    }
    if (!isPaused(setting('water'), now)) {
      const weight = profQ.data?.find((p) => p.id === uid)?.weight_kg ?? 60;
      const goal = Math.min(4000, Math.max(1500, weight * 35));
      const drunk = (waterQ.data ?? []).reduce((a, w) => a + w.ml, 0);
      if (drunk < goal) for (const at of setting('water')?.times ?? DEFAULT_WATER_TIMES) if (isDue(local, at)) queue.push({ key: `water:${at}`, category: 'water', title: 'Recordá tomar agua', body: `Llevás ${drunk} ml de ${Math.round(goal)} ml.` });
    }
    if (!isPaused(setting('training'), now) && (prefs.training_days as number[]).includes(local.weekday) && !sessQ.data?.length) {
      const at = (prefs.preferred_training_time as string | null)?.slice(0, 5) ?? '18:00';
      if (isDue(local, at)) queue.push({ key: 'train', category: 'training', title: 'Es hora de entrenar', body: 'Tu rutina de hoy te está esperando.' });
    }
    if (!isPaused(setting('supplements'), now)) {
      for (const s of suppQ.data?.filter((x) => x.user_id === uid) ?? []) for (const at of s.times as string[]) {
        const taken = intakeQ.data?.some((i) => i.supplement_id === s.id && i.time_slot === at);
        if (!taken && isDue(local, at)) queue.push({ key: `supp:${s.id}:${at}`, category: 'supplements', title: 'Tenés un suplemento pendiente', body: s.name });
      }
    }

    for (const q of queue) {
      // Un recordatorio por clave y por día: la inserción falla si ya se envió.
      const { error } = await admin.from('reminder_log').insert({ user_id: uid, key: q.key, sent_on: local.date });
      if (error) continue;
      for (const to of tokensOf) out.push({ to, title: q.title, body: q.body, sound: 'default', data: { category: q.category } });
    }
  }

  let sent = 0;
  for (let i = 0; i < out.length; i += 100) {
    const batch = out.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(batch) });
    if (!res.ok) continue;
    const { data } = await res.json();
    sent += batch.length;
    // Tokens inválidos se eliminan.
    for (let j = 0; j < (data ?? []).length; j++) if (data[j]?.details?.error === 'DeviceNotRegistered') await admin.from('push_tokens').delete().eq('token', batch[j].to);
  }
  return json({ sent });
});
