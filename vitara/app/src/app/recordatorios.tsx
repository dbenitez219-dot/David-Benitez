import { useCallback, useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { registerForPush, type PushResult } from '@/lib/push';
import { csv, validTime } from '@/lib/calc';
import { tr } from '@/i18n';
import { useTheme } from '@/lib/theme';
import { Body, Button, Card, ErrorText, Field, H1, H2, Label, Screen } from '@/ui';
import { Badge, Link2, Notice, Row } from '@/ui/Bits';

const CATS = ['meals', 'water', 'training', 'supplements', 'sleep', 'partner', 'achievements'] as const;
const NOT_YET = ['sleep', 'partner', 'achievements'];
const DEFAULT_WATER = ['10:00', '12:30', '15:00', '17:30', '20:00'];
type S = { category: string; enabled: boolean; paused_until: string | null; times: string[] | null };
const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;

export default function Reminders() {
  const t = tr(); const r = t.rem; const c = useTheme();
  const { session, prefs, refresh } = useAuth();
  const [rows, setRows] = useState<S[]>([]); const [push, setPush] = useState<PushResult | 'unknown'>('unknown');
  const [water, setWater] = useState(DEFAULT_WATER.join(', '));
  const [meals, setMeals] = useState<Record<string, string>>({ breakfast: '08:00', lunch: '13:00', snack: '17:00', dinner: '21:00', ...(prefs?.meal_times ?? {}) });
  const [train, setTrain] = useState(((prefs as any)?.preferred_training_time as string | null)?.slice(0, 5) ?? '18:00');
  const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('notification_settings').select('*').eq('user_id', session.user.id);
    setRows((data ?? []) as S[]);
    const w = (data ?? []).find((x: S) => x.category === 'water')?.times; if (w?.length) setWater(w.join(', '));
    const tk = await supabase.from('push_tokens').select('token', { count: 'exact', head: true }).eq('user_id', session.user.id);
    if ((tk.count ?? 0) > 0) setPush('ok');
  }, [session]);
  useEffect(() => { load(); }, [load]);

  const get = (cat: string): S => rows.find((x) => x.category === cat) ?? { category: cat, enabled: true, paused_until: null, times: null };
  async function patch(cat: string, p: Partial<S>) {
    if (!session) return;
    const next = { ...get(cat), ...p };
    const { error: e } = await supabase.from('notification_settings').upsert({ user_id: session.user.id, category: cat, enabled: next.enabled, paused_until: next.paused_until, times: next.times }, { onConflict: 'user_id,category' });
    if (e) return setError(e.message);
    setError(null); load();
  }
  const paused = (s: S) => !!s.paused_until && new Date(s.paused_until).getTime() > Date.now();

  async function enablePush() { if (session) setPush(await registerForPush(session.user.id)); }
  async function saveSchedule() {
    if (!session) return;
    const wt = csv(water);
    if (wt.some((x) => !validTime(x)) || Object.values(meals).some((x) => !validTime(x)) || !validTime(train)) return setError('HH:MM');
    await patch('water', { times: wt });
    const { error: e } = await supabase.from('preferences').update({ meal_times: meals, preferred_training_time: train }).eq('user_id', session.user.id);
    if (e) return setError(e.message);
    await refresh(); setSaved(true); setTimeout(() => setSaved(false), 2000); setError(null);
  }

  const pushMsg = push === 'ok' ? r.pushOn : push === 'denied' ? r.pushDenied : push === 'web' ? r.pushWeb : push === 'no_project' ? r.pushNoProject : push === 'error' ? t.common.error : null;

  return (
    <Screen>
      <Link2 title={`‹ ${t.common.back}`} onPress={() => router.back()} />
      <H1>{r.title}</H1>
      <View style={{ height: 12 }} />
      <Card>
        <H2>{r.push}</H2>
        {pushMsg ? <Body small muted>{pushMsg}</Body> : null}
        {push !== 'ok' && <Button title={r.enablePush} onPress={enablePush} />}
      </Card>

      <Card index={1}>
        <H2>{r.categories}</H2>
        {CATS.map((cat) => {
          const s = get(cat); const soon = NOT_YET.includes(cat);
          return (
            <View key={cat} style={{ paddingVertical: 8 }}>
              <Row>
                <View style={{ flex: 1 }}><Body>{r.cat[cat]}</Body>{soon ? <Body small muted>{r.soon}</Body> : null}</View>
                <Switch value={s.enabled} onValueChange={(v) => patch(cat, { enabled: v })} trackColor={{ true: c.accent, false: c.track }} accessibilityLabel={r.cat[cat]} />
              </Row>
              {s.enabled && !soon && (
                <Row between={false}>
                  {paused(s) ? <><Badge tone="warn" text={`${r.pausedUntil} ${new Date(s.paused_until!).toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`} /><View style={{ width: 8 }} /><Link2 title={r.resume} onPress={() => patch(cat, { paused_until: null })} /></>
                    : <Link2 title={r.pause} onPress={() => patch(cat, { paused_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })} />}
                </Row>
              )}
            </View>
          );
        })}
      </Card>

      <Card index={2}>
        <H2>{r.schedule}</H2>
        {MEALS.map((k) => <Field key={k} label={t.onboarding.meal[k]} value={meals[k]} onChangeText={(v) => setMeals({ ...meals, [k]: v })} placeholder="08:00" />)}
        <Field label={r.trainTime} value={train} onChangeText={setTrain} placeholder="18:00" />
        <Field label={r.waterTimes} value={water} onChangeText={setWater} />
        <ErrorText>{error}</ErrorText>
        <Button title={saved ? '✓' : t.common.save} onPress={saveSchedule} />
      </Card>
      <Notice>{t.today.disclaimer}</Notice>
    </Screen>
  );
}
