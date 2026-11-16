import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { callFn } from '@/lib/api';
import { getCatalog, type Exercise } from '@/lib/catalog';
import { isoWeekday } from '@/lib/calc';
import { localDate } from '@/lib/dates';
import { confirmAction } from '@/lib/dialogs';
import { tr } from '@/i18n';
import { Body, Button, Card, ErrorText, H1, H2, Label, Screen } from '@/ui';
import { Badge, Empty, Notice, Row } from '@/ui/Bits';

export type DayPlan = {
  weekday: number; kind: 'training' | 'rest'; title: string;
  warmup: { exercise_id: string; seconds: number }[]; cooldown: { exercise_id: string; seconds: number }[];
  exercises: { exercise_id: string; sets: number; reps_min: number; reps_max: number; rest_sec: number; notes?: string }[];
};
type Plan = { id: string; week: DayPlan[]; rationale: string | null };
type Session = { id: string; status: 'in_progress' | 'completed' };

export default function Train() {
  const t = tr(); const { session } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [cat, setCat] = useState<Map<string, Exercise>>(new Map());
  const [today, setToday] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const wd = isoWeekday();

  const load = useCallback(async () => {
    if (!session) return;
    const [p, s, c] = await Promise.all([
      supabase.from('workout_plans').select('id,week,rationale').eq('user_id', session.user.id).eq('active', true).maybeSingle(),
      supabase.from('workout_sessions').select('id,status').eq('user_id', session.user.id).eq('session_date', localDate()).maybeSingle(),
      getCatalog(),
    ]);
    setPlan(p.data as Plan | null); setToday(s.data as Session | null); setCat(c); setLoading(false);
  }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function generate() {
    if (plan && !(await confirmAction(t.train.regenerate, t.train.regenConfirm, t.train.regenerate, t.common.cancel))) return;
    setBusy(true); setError(null);
    try { await callFn('generate-training-plan'); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function start(day: DayPlan) {
    if (!session || !plan) return;
    setBusy(true); setError(null);
    try {
      let id = today?.id;
      if (!id) {
        const uid = session.user.id;
        const ins = await supabase.from('workout_sessions').insert({ user_id: uid, plan_id: plan.id, session_date: localDate(), weekday: wd, title: day.title }).select('id').single();
        if (ins.error) throw ins.error;
        id = ins.data.id as string;
        const rows = day.exercises.map((e, i) => ({ session_id: id, user_id: uid, position: i, exercise_id: e.exercise_id, sets: e.sets, reps_min: e.reps_min, reps_max: e.reps_max, rest_sec: e.rest_sec }));
        const r = await supabase.from('session_exercises').insert(rows);
        if (r.error) throw r.error;
      }
      router.push({ pathname: '/sesion', params: { id } });
    } catch (e: any) { setError(e.message ?? t.common.error); } finally { setBusy(false); }
  }

  const day = plan?.week.find((d) => d.weekday === wd);
  const name = (id: string) => cat.get(id)?.name ?? id;

  return (
    <Screen>
      <Label>{t.daysLong[wd - 1]}</Label>
      <H1>{t.train.title}</H1>
      <View style={{ height: 16 }} />
      {loading ? <Body muted>{t.common.loading}</Body> : !plan ? (
        <Card>
          <H2>{t.train.noPlan}</H2>
          <Body muted>{t.train.noPlanHint}</Body>
          <Button title={busy ? t.train.generating : t.train.generate} onPress={generate} loading={busy} />
        </Card>
      ) : (<>
        {day && (
          <Card>
            <Row><Label>{t.train.today}</Label>{today?.status === 'completed' ? <Badge tone="good" text={t.train.done} /> : null}</Row>
            {day.kind === 'rest' ? (<><H2>{t.train.rest}</H2><Body muted>{t.train.restHint}</Body></>) : (<>
              <H2>{day.title}</H2>
              {day.exercises.map((e) => <Body key={e.exercise_id} small muted>• {name(e.exercise_id)} — {e.sets} × {e.reps_min}{e.reps_max !== e.reps_min ? `–${e.reps_max}` : ''}</Body>)}
              {today?.status !== 'completed' && <Button title={today ? t.train.resume : t.train.start} onPress={() => start(day)} loading={busy} />}
              {today?.status === 'completed' && <Button title={t.train.resume} variant="ghost" onPress={() => router.push({ pathname: '/sesion', params: { id: today.id } })} />}
            </>)}
          </Card>
        )}
        <Card index={1}>
          <H2>{t.train.week}</H2>
          {plan.week.map((d) => (
            <Row key={d.weekday}>
              <Body style={{ paddingVertical: 6, fontFamily: d.weekday === wd ? 'Inter_600SemiBold' : 'Inter_400Regular' }}>{t.daysLong[d.weekday - 1]}</Body>
              <Body muted small>{d.kind === 'rest' ? t.train.rest : d.title}</Body>
            </Row>
          ))}
        </Card>
        {plan.rationale ? <Card index={2}><H2>{t.train.why}</H2><Body muted>{plan.rationale}</Body></Card> : null}
        <Notice>{t.train.pain}</Notice>
        <Button title={t.train.regenerate} variant="ghost" onPress={generate} loading={busy} />
      </>)}
      <ErrorText>{error}</ErrorText>
      {!loading && !plan && <Empty>{''}</Empty>}
    </Screen>
  );
}
