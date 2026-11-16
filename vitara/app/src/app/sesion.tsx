import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { equipmentSet, getCatalog, type Exercise } from '@/lib/catalog';
import { suggestNext, type LoggedSet } from '@/lib/progression';
import { num } from '@/lib/calc';
import { confirmAction } from '@/lib/dialogs';
import { tr } from '@/i18n';
import { font, radius, useTheme } from '@/lib/theme';
import { Body, Button, Card, Chip, ChipRow, ErrorText, H1, H2, Label, Screen } from '@/ui';
import { Badge, Link2, Notice, Row } from '@/ui/Bits';
import { CoachChat } from '@/ui/CoachChat';
import type { DayPlan } from './(tabs)/entreno';

type SE = { id: string; position: number; exercise_id: string; sets: number; reps_min: number; reps_max: number; rest_sec: number; done: boolean; swapped_from: string | null };
type SL = { session_exercise_id: string; set_number: number; weight_kg: number | null; reps: number | null };
const LOWER = ['piernas', 'glúteos', 'femorales', 'cuádriceps', 'gemelos'];

export default function Session() {
  const t = tr(); const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, prefs } = useAuth();
  const [cat, setCat] = useState<Map<string, Exercise>>(new Map());
  const [title, setTitle] = useState(''); const [status, setStatus] = useState('in_progress');
  const [items, setItems] = useState<SE[]>([]); const [logs, setLogs] = useState<SL[]>([]);
  const [prev, setPrev] = useState<Record<string, LoggedSet[]>>({});
  const [day, setDay] = useState<DayPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session || !id) return;
    const [catalog, s, se] = await Promise.all([
      getCatalog(),
      supabase.from('workout_sessions').select('title,status,plan_id,weekday').eq('id', id).single(),
      supabase.from('session_exercises').select('*').eq('session_id', id).order('position'),
    ]);
    setCat(catalog);
    if (s.data) {
      setTitle(s.data.title); setStatus(s.data.status);
      if (s.data.plan_id) {
        const p = await supabase.from('workout_plans').select('week').eq('id', s.data.plan_id).maybeSingle();
        setDay((p.data?.week as DayPlan[] | undefined)?.find((d) => d.weekday === s.data!.weekday) ?? null);
      }
    }
    const mine = (se.data ?? []) as SE[];
    setItems(mine);
    if (!mine.length) return;
    const sl = await supabase.from('set_logs').select('session_exercise_id,set_number,weight_kg,reps').in('session_exercise_id', mine.map((x) => x.id));
    setLogs((sl.data ?? []) as SL[]);
    // Última vez: series de la sesión anterior para cada ejercicio (para sugerir progresión).
    const exIds = mine.map((x) => x.exercise_id);
    const past = await supabase.from('set_logs').select('exercise_id,session_exercise_id,weight_kg,reps,logged_at').eq('user_id', session.user.id).in('exercise_id', exIds).not('session_exercise_id', 'in', `(${mine.map((x) => x.id).join(',')})`).order('logged_at', { ascending: false }).limit(300);
    const byEx: Record<string, LoggedSet[]> = {}; const latestSe: Record<string, string> = {};
    for (const r of (past.data ?? []) as any[]) {
      latestSe[r.exercise_id] ??= r.session_exercise_id;
      if (latestSe[r.exercise_id] === r.session_exercise_id) (byEx[r.exercise_id] ??= []).push({ weight_kg: r.weight_kg, reps: r.reps });
    }
    setPrev(byEx);
  }, [session, id]);
  useEffect(() => { load(); }, [load]);

  const name = (x: string) => cat.get(x)?.name ?? x;

  async function saveSet(se: SE, setNumber: number, w: string, r: string) {
    if (!session) return;
    const reps = num(r); const ex = cat.get(se.exercise_id);
    if (reps === null || reps < 0) return setError(t.onboarding.invalid);
    const weight = ex?.kind === 'strength' ? num(w) : null;
    const { error: e } = await supabase.from('set_logs').upsert({ session_exercise_id: se.id, user_id: session.user.id, exercise_id: se.exercise_id, set_number: setNumber, weight_kg: weight, reps: Math.round(reps) }, { onConflict: 'session_exercise_id,set_number' });
    if (e) return setError(e.message);
    setError(null);
    setLogs((p) => [...p.filter((l) => !(l.session_exercise_id === se.id && l.set_number === setNumber)), { session_exercise_id: se.id, set_number: setNumber, weight_kg: weight, reps: Math.round(reps) }]);
  }
  async function toggleDone(se: SE) {
    const { error: e } = await supabase.from('session_exercises').update({ done: !se.done }).eq('id', se.id);
    if (e) return setError(e.message);
    setItems((p) => p.map((x) => (x.id === se.id ? { ...x, done: !x.done } : x)));
  }
  async function swap(se: SE, to: Exercise, never: boolean) {
    if (!session) return;
    await supabase.from('set_logs').delete().eq('session_exercise_id', se.id);
    const { error: e } = await supabase.from('session_exercises').update({ exercise_id: to.id, swapped_from: se.swapped_from ?? se.exercise_id, done: false }).eq('id', se.id);
    if (e) return setError(e.message);
    if (never) await supabase.from('exercise_exclusions').upsert({ user_id: session.user.id, exercise_id: se.exercise_id }, { onConflict: 'user_id,exercise_id' });
    load();
  }
  async function finish() {
    if (!(await confirmAction(t.train.finish, t.train.finishConfirm, t.train.finish, t.common.cancel))) return;
    const { error: e } = await supabase.from('workout_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    if (e) return setError(e.message);
    router.replace('/(tabs)/entreno');
  }

  return (
    <Screen>
      <Link2 title={`‹ ${t.common.back}`} onPress={() => router.back()} />
      <H1>{title || t.train.title}</H1>
      <View style={{ height: 12 }} />
      {day && (day.warmup.length > 0) && (
        <Card><H2>{t.train.warmup}</H2>{day.warmup.map((w) => <Body key={w.exercise_id} small>• {name(w.exercise_id)} — {w.seconds} {t.train.sec}</Body>)}</Card>
      )}
      {items.map((se, i) => (
        <ExerciseCard key={se.id} index={i} se={se} ex={cat.get(se.exercise_id)} logs={logs.filter((l) => l.session_exercise_id === se.id)} prev={prev[se.exercise_id]}
          locked={status === 'completed'} onSave={(n, w, r) => saveSet(se, n, w, r)} onToggle={() => toggleDone(se)}
          catalog={cat} sessionIds={items.map((x) => x.exercise_id)} equipment={equipmentSet(prefs?.training_place, prefs?.equipment ?? [])} onSwap={(to, never) => swap(se, to, never)} />
      ))}
      {day && day.cooldown.length > 0 && (
        <Card><H2>{t.train.cooldown}</H2>{day.cooldown.map((w) => <Body key={w.exercise_id} small>• {name(w.exercise_id)} — {w.seconds} {t.train.sec}</Body>)}</Card>
      )}
      <Notice>{t.train.pain}</Notice>
      <ErrorText>{error}</ErrorText>
      {status !== 'completed' && <Button title={t.train.finish} onPress={finish} />}
    </Screen>
  );
}

function ExerciseCard(props: {
  index: number; se: SE; ex?: Exercise; logs: SL[]; prev?: LoggedSet[]; locked: boolean; catalog: Map<string, Exercise>; sessionIds: string[]; equipment: Set<string>;
  onSave: (n: number, w: string, r: string) => void; onToggle: () => void; onSwap: (to: Exercise, never: boolean) => void;
}) {
  const t = tr(); const c = useTheme();
  const { se, ex, logs, prev } = props;
  const [how, setHow] = useState(false); const [swapOpen, setSwapOpen] = useState(false); const [ask, setAsk] = useState(false); const [never, setNever] = useState(false);
  if (!ex) return null;
  const strength = ex.kind === 'strength';
  const sug = prev ? suggestNext(prev, se.reps_min, se.reps_max, LOWER.some((m) => ex.muscle.includes(m))) : null;
  const unit = ex.unit === 'seconds' ? t.train.sec : ex.unit === 'minutes' ? t.train.min : t.train.reps;
  const alternatives = [...props.catalog.values()].filter((o) => o.id !== ex.id && o.kind === ex.kind && o.kind !== 'mobility' && !props.sessionIds.includes(o.id) && o.equipment.every((e) => props.equipment.has(e)) && (o.muscle.split(/[ ,y]+/).some((w) => w.length > 3 && ex.muscle.includes(w)))).slice(0, 6);

  return (
    <Card index={props.index}>
      <Row><H2>{ex.name}</H2>{se.done ? <Badge tone="good" text="✓" /> : null}</Row>
      <Body muted small>{se.sets} {t.train.sets} × {se.reps_min}{se.reps_max !== se.reps_min ? `–${se.reps_max}` : ''} {unit} · {t.train.rest_s} {se.rest_sec} s</Body>
      {se.swapped_from ? <Body muted small>{t.train.swapped} {props.catalog.get(se.swapped_from)?.name}</Body> : null}
      {strength && (
        <Body small style={{ marginTop: 6, color: c.accent }}>
          {sug ? `${t.train.lastTime}: ${prev!.map((s) => `${s.weight_kg ?? ''}${s.weight_kg != null ? '×' : ''}${s.reps}`).join(', ')} → ${t.train.suggest} ${sug.weight_kg != null ? `${sug.weight_kg} kg × ` : ''}${sug.reps}. ${t.train.reasons[sug.reason as keyof typeof t.train.reasons] ?? ''}` : t.train.firstTime}
        </Body>
      )}
      {Array.from({ length: se.sets }, (_, k) => k + 1).map((n) => (
        <SetRow key={n} n={n} strength={strength} unit={unit} saved={logs.find((l) => l.set_number === n)} disabled={props.locked}
          placeholderW={sug?.weight_kg ?? null} placeholderR={sug?.reps ?? se.reps_min} onSave={(w, r) => props.onSave(n, w, r)} />
      ))}
      <Row between={false}>
        <Link2 title={how ? t.train.hideHow : t.train.howTo} onPress={() => setHow(!how)} />
        <View style={{ width: 16 }} />
        <Link2 title={t.train.ask} onPress={() => setAsk(!ask)} />
      </Row>
      {how && (<View>{ex.instructions.map((s, i) => <Body key={i} small>{i + 1}. {s}</Body>)}{ex.tips ? <Body small muted style={{ marginTop: 4 }}>💡 {ex.tips}</Body> : null}</View>)}
      {ask && <CoachChat exerciseId={ex.id} />}
      {!props.locked && (<>
        <Button title={se.done ? t.train.exerciseUndo : t.train.exerciseDone} variant={se.done ? 'ghost' : 'primary'} onPress={props.onToggle} />
        <Link2 title={t.train.cant} onPress={() => setSwapOpen(!swapOpen)} />
        {swapOpen && (<View>
          <Label>{t.train.swapTitle}</Label>
          {alternatives.length === 0 ? <Body muted small>{t.train.swapNone}</Body> : (<>
            <ChipRow><Chip label={t.train.neverAgain} selected={never} onPress={() => setNever(!never)} /></ChipRow>
            {alternatives.map((a) => <Button key={a.id} title={a.name} variant="ghost" onPress={() => { setSwapOpen(false); props.onSwap(a, never); }} />)}
          </>)}
        </View>)}
      </>)}
    </Card>
  );
}

function SetRow({ n, strength, unit, saved, disabled, placeholderW, placeholderR, onSave }: { n: number; strength: boolean; unit: string; saved?: SL; disabled: boolean; placeholderW: number | null; placeholderR: number; onSave: (w: string, r: string) => void }) {
  const c = useTheme();
  const [w, setW] = useState(saved?.weight_kg != null ? String(saved.weight_kg) : ''); const [r, setR] = useState(saved?.reps != null ? String(saved.reps) : '');
  const input = { fontFamily: font.body, fontSize: 15, color: c.ink, backgroundColor: c.bg, borderRadius: radius.input, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, paddingVertical: 8, width: 72, textAlign: 'center' as const };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
      <Text style={{ fontFamily: font.medium, color: c.muted, width: 24 }}>{n}</Text>
      {strength && <TextInput value={w} onChangeText={setW} editable={!disabled} keyboardType="decimal-pad" placeholder={placeholderW != null ? String(placeholderW) : 'kg'} placeholderTextColor={c.muted} style={[input, { marginRight: 8 }]} accessibilityLabel={`Serie ${n} peso`} />}
      <TextInput value={r} onChangeText={setR} editable={!disabled} keyboardType="number-pad" placeholder={String(placeholderR)} placeholderTextColor={c.muted} style={input} accessibilityLabel={`Serie ${n} ${unit}`} />
      <Text style={{ fontFamily: font.body, color: c.muted, marginLeft: 6, flex: 1 }}>{unit}</Text>
      {!disabled && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Guardar serie ${n}`} onPress={() => onSave(w, r)} style={{ backgroundColor: saved ? c.accent : c.track, borderRadius: radius.pill, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: saved ? c.onAccent : c.muted, fontSize: 18 }}>✓</Text>
        </Pressable>
      )}
    </View>
  );
}
