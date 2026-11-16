import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { hydrationTargetMl, isoWeekday, num } from '@/lib/calc';
import { localDate, nowHHMM } from '@/lib/dates';
import { useCouple } from '@/lib/useCouple';
import { fmt, tr } from '@/i18n';
import { useTheme } from '@/lib/theme';
import { Body, Button, Card, ErrorText, Field, H1, H2, Label, ProgressBar, Screen } from '@/ui';
import { Badge, Link2, Row } from '@/ui/Bits';

type Day = {
  trainKind: 'none' | 'training' | 'rest'; trainStatus: 'none' | 'in_progress' | 'completed'; trainTitle: string;
  planKcal: number | null; kcal: number; loggedTypes: string[];
  waterMl: number; lastWaterId: string | null; suppPending: number; suppTotal: number;
};
const empty: Day = { trainKind: 'none', trainStatus: 'none', trainTitle: '', planKcal: null, kcal: 0, loggedTypes: [], waterMl: 0, lastWaterId: null, suppPending: 0, suppTotal: 0 };
const TYPES = ['breakfast', 'lunch', 'snack', 'dinner'];

export default function Today() {
  const t = tr(); const c = useTheme();
  const { profile, prefs, session } = useAuth();
  const couple = useCouple();
  const [d, setD] = useState<Day>(empty); const [custom, setCustom] = useState(''); const [error, setError] = useState<string | null>(null);
  const wd = isoWeekday();

  const load = useCallback(async () => {
    if (!session) return;
    const uid = session.user.id, date = localDate();
    const [plan, sess, np, meals, water, supps, intakes] = await Promise.all([
      supabase.from('workout_plans').select('week').eq('user_id', uid).eq('active', true).maybeSingle(),
      supabase.from('workout_sessions').select('status').eq('user_id', uid).eq('session_date', date).maybeSingle(),
      supabase.from('nutrition_plans').select('targets').eq('user_id', uid).eq('active', true).maybeSingle(),
      supabase.from('meal_logs').select('meal_type,status,kcal').eq('user_id', uid).eq('log_date', date),
      supabase.from('water_logs').select('id,ml,logged_at').eq('user_id', uid).eq('log_date', date).order('logged_at', { ascending: false }),
      supabase.from('supplements').select('id,times').eq('user_id', uid).eq('active', true),
      supabase.from('supplement_intakes').select('supplement_id,time_slot').eq('user_id', uid).eq('taken_on', date),
    ]);
    const day = (plan.data?.week as any[] | undefined)?.find((x) => x.weekday === wd);
    let total = 0, pending = 0;
    for (const s of supps.data ?? []) for (const slot of (s.times as string[]).length ? (s.times as string[]) : ['']) {
      total++; if (!intakes.data?.some((i) => i.supplement_id === s.id && i.time_slot === slot)) pending++;
    }
    setD({
      trainKind: day ? day.kind : 'none', trainStatus: (sess.data?.status as Day['trainStatus']) ?? 'none', trainTitle: day?.title ?? '',
      planKcal: (np.data?.targets as any)?.kcal ?? null,
      kcal: Math.round((meals.data ?? []).filter((m) => m.status === 'logged').reduce((a, m) => a + (m.kcal ?? 0), 0)),
      loggedTypes: (meals.data ?? []).map((m) => m.meal_type),
      waterMl: (water.data ?? []).reduce((a, w) => a + w.ml, 0), lastWaterId: water.data?.[0]?.id ?? null, suppPending: pending, suppTotal: total,
    });
  }, [session, wd]);
  useFocusEffect(useCallback(() => { load(); couple.reload(); }, [load, couple.reload]));

  async function addWater(ml: number) {
    if (!session || ml <= 0 || ml > 3000) return setError(t.onboarding.invalid);
    const { error: e } = await supabase.from('water_logs').insert({ user_id: session.user.id, log_date: localDate(), ml: Math.round(ml) });
    if (e) return setError(e.message);
    setError(null); setCustom(''); load();
  }
  async function undoWater() { if (d.lastWaterId) { await supabase.from('water_logs').delete().eq('id', d.lastWaterId); load(); } }

  const waterGoal = hydrationTargetMl(profile?.weight_kg) ?? 2000;
  const mt = (prefs?.meal_times ?? {}) as Record<string, string>;
  const pendingMeals = TYPES.filter((x) => !d.loggedTypes.includes(x));
  const next = pendingMeals.find((x) => (mt[x] ?? '00:00') >= nowHHMM()) ?? pendingMeals[0];
  const w = profile?.weight_kg, tw = profile?.target_weight_kg;
  const done = [d.trainKind === 'rest' || d.trainStatus === 'completed', pendingMeals.length === 0, d.waterMl >= waterGoal, d.suppTotal === 0 || d.suppPending === 0];

  return (
    <Screen>
      <Label>{t.daysLong[wd - 1]}</Label>
      <H1>{fmt(t.today.greeting, { name: profile?.display_name ?? '' })}</H1>
      <View style={{ height: 6 }} />
      <Body muted small>{done.filter(Boolean).length}/4 · {t.today.dailyGoals}</Body>
      <ProgressBar value={done.filter(Boolean).length / 4} />
      <View style={{ height: 16 }} />

      <Card index={0}>
        <Row><Label>{t.today.trainer}</Label>{d.trainStatus === 'completed' ? <Badge tone="good" text={t.train.done} /> : d.trainKind === 'rest' ? <Badge text={t.train.rest} /> : null}</Row>
        {d.trainKind === 'none' ? <Body muted>{t.today.trainerNoPlan}</Body>
          : d.trainKind === 'rest' ? <Body muted>{t.train.restHint}</Body>
          : <H2>{d.trainTitle}</H2>}
        <Link2 title={d.trainKind === 'none' ? t.train.generate : t.today.goTrain} onPress={() => router.push('/(tabs)/entreno')} />
      </Card>

      <Card index={1}>
        <Row><Label>{t.today.meals}</Label><Body small muted>{d.loggedTypes.length}/4</Body></Row>
        <H2>{d.kcal}{d.planKcal ? ` / ${d.planKcal}` : ''} kcal</H2>
        {d.planKcal ? <ProgressBar value={d.kcal / d.planKcal} /> : null}
        {next ? <Body small muted style={{ marginTop: 8 }}>{t.today.nextMeal}: {(t.meals.names as Record<string, string>)[next]} · {mt[next] ?? ''}</Body> : <Body small style={{ marginTop: 8, color: c.accent }}>{t.today.allMeals}</Body>}
        <Link2 title={next ? t.meals.photo : t.meals.title} onPress={() => (next ? router.push({ pathname: '/comida', params: { type: next } }) : router.push('/(tabs)/comidas'))} />
      </Card>

      <Card index={2}>
        <Row><Label>{t.water.title}</Label><Body small muted>{t.water.goal}: {(waterGoal / 1000).toLocaleString('es', { minimumFractionDigits: 1 })} L</Body></Row>
        <H2>{(d.waterMl / 1000).toLocaleString('es', { minimumFractionDigits: 2 })} L</H2>
        <ProgressBar value={d.waterMl / waterGoal} />
        <Row between={false}>
          <View style={{ flex: 1, marginRight: 8 }}><Button title="+250 ml" variant="ghost" onPress={() => addWater(250)} /></View>
          <View style={{ flex: 1 }}><Button title="+500 ml" variant="ghost" onPress={() => addWater(500)} /></View>
        </Row>
        <Row between={false}>
          <View style={{ flex: 1, marginRight: 8 }}><Field label={t.water.custom} value={custom} onChangeText={setCustom} keyboardType="number-pad" /></View>
          <View style={{ paddingTop: 8 }}><Button title={t.water.add} onPress={() => addWater(num(custom) ?? 0)} disabled={!custom} /></View>
        </Row>
        {d.lastWaterId ? <Link2 title={t.water.undo} onPress={undoWater} /> : null}
        <ErrorText>{error}</ErrorText>
        <Body small muted>{t.today.waterHint}</Body>
      </Card>

      <Card index={3}>
        <Row><Label>{t.today.supps}</Label>{d.suppTotal > 0 ? <Badge tone={d.suppPending ? 'warn' : 'good'} text={d.suppPending ? `${d.suppPending} ${t.today.pending}` : '✓'} /> : null}</Row>
        <Body muted>{d.suppTotal === 0 ? t.supp.empty : `${d.suppTotal - d.suppPending}/${d.suppTotal} ${t.supp.taken.toLowerCase()}`}</Body>
        <Link2 title={t.supp.title} onPress={() => router.push('/suplementos')} />
      </Card>

      {w != null && (
        <Card index={4}>
          <Label>{t.today.weight}</Label>
          <H2>{w.toLocaleString('es')} kg</H2>
          {tw != null && <Body muted small>{t.today.toTarget}: {tw.toLocaleString('es')} kg</Body>}
        </Card>
      )}

      <Card index={5}>
        <Label>{t.today.partner}</Label>
        <Body>{couple.status?.linked ? fmt(t.today.partnerLinked, { name: couple.status.partner_name ?? '' }) : t.today.partnerNone}</Body>
      </Card>

      <Card index={6} style={{ backgroundColor: c.accentSoft }}>
        <Label>{t.today.soon}</Label>
        <Body small muted>{t.today.sleep} · {t.today.streak}</Body>
      </Card>
      <Link2 title={t.rem.title} onPress={() => router.push('/recordatorios')} />
      <Body muted small style={{ textAlign: 'center', marginTop: 8 }}>{t.today.disclaimer}</Body>
    </Screen>
  );
}
