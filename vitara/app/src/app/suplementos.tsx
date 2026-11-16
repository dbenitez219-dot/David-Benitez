import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { csv, validTime } from '@/lib/calc';
import { daysAgo, localDate } from '@/lib/dates';
import { findKnowledge, warningsFor, type Knowledge } from '@/lib/supplementWarnings';
import { confirmAction } from '@/lib/dialogs';
import { tr } from '@/i18n';
import { font, useTheme } from '@/lib/theme';
import { Body, Button, Card, ErrorText, Field, H1, H2, Label, Screen } from '@/ui';
import { Badge, Empty, Link2, Notice, Row } from '@/ui/Bits';

type Supp = { id: string; name: string; dose: string | null; frequency: string | null; times: string[]; notes: string | null };
type Intake = { supplement_id: string; taken_on: string; time_slot: string };

export default function Supplements() {
  const t = tr(); const s = t.supp; const c = useTheme();
  const { session, health } = useAuth();
  const [list, setList] = useState<Supp[]>([]); const [kb, setKb] = useState<Knowledge[]>([]); const [intakes, setIntakes] = useState<Intake[]>([]);
  const [open, setOpen] = useState<string | null>(null); const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', dose: '', freq: '', times: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const authorized = !!health?.health_consent_at;

  const load = useCallback(async () => {
    if (!session) return;
    const [a, b, d] = await Promise.all([
      supabase.from('supplements').select('id,name,dose,frequency,times,notes').eq('user_id', session.user.id).eq('active', true).order('created_at'),
      supabase.from('supplement_knowledge').select('*'),
      supabase.from('supplement_intakes').select('supplement_id,taken_on,time_slot').eq('user_id', session.user.id).gte('taken_on', daysAgo(6)),
    ]);
    setList((a.data ?? []) as Supp[]); setKb((b.data ?? []) as Knowledge[]); setIntakes((d.data ?? []) as Intake[]);
  }, [session]);
  useEffect(() => { load(); }, [load]);

  const preview = adding ? findKnowledge(f.name, kb) : null;
  const slots = (x: Supp) => (x.times.length ? x.times : ['']);
  const taken = (x: Supp, slot: string, date = localDate()) => intakes.some((i) => i.supplement_id === x.id && i.taken_on === date && i.time_slot === slot);

  async function add() {
    if (!session) return;
    const times = csv(f.times);
    if (!f.name.trim()) return setError(t.onboarding.invalid);
    if (times.some((x) => !validTime(x))) return setError('HH:MM');
    const { error: e } = await supabase.from('supplements').insert({ user_id: session.user.id, name: f.name.trim(), dose: f.dose.trim() || null, frequency: f.freq.trim() || null, times, notes: f.notes.trim() || null });
    if (e) return setError(e.message);
    setF({ name: '', dose: '', freq: '', times: '', notes: '' }); setAdding(false); setError(null); load();
  }
  async function toggle(x: Supp, slot: string) {
    if (!session) return;
    if (taken(x, slot)) {
      await supabase.from('supplement_intakes').delete().eq('supplement_id', x.id).eq('taken_on', localDate()).eq('time_slot', slot);
    } else {
      const { error: e } = await supabase.from('supplement_intakes').upsert({ user_id: session.user.id, supplement_id: x.id, taken_on: localDate(), time_slot: slot }, { onConflict: 'supplement_id,taken_on,time_slot' });
      if (e) return setError(e.message);
    }
    load();
  }
  async function stop(x: Supp) {
    if (!(await confirmAction(s.stop, x.name, s.stop, t.common.cancel))) return;
    await supabase.from('supplements').update({ active: false }).eq('id', x.id); load();
  }
  const adherence = (x: Supp) => {
    const expected = slots(x).length * 7; const done = intakes.filter((i) => i.supplement_id === x.id).length;
    return `${Math.min(done, expected)}/${expected}`;
  };
  const tone = (l: string) => (l === 'consult' ? 'warn' : 'neutral') as 'warn' | 'neutral';

  return (
    <Screen>
      <Link2 title={`‹ ${t.common.back}`} onPress={() => router.back()} />
      <H1>{s.title}</H1>
      <Notice>{s.intro}</Notice>
      {!authorized && <Notice tone="warn">{s.authHint}</Notice>}

      {list.length === 0 && !adding ? <Empty>{s.empty}</Empty> : null}
      {list.map((x, i) => {
        const w = warningsFor(findKnowledge(x.name, kb), health?.medications ?? null, health?.conditions ?? null, authorized);
        const k = findKnowledge(x.name, kb);
        return (
          <Card key={x.id} index={i}>
            <Row><H2>{x.name}</H2><Badge text={`${s.adherence} ${adherence(x)}`} /></Row>
            <Body small muted>{[x.dose, x.frequency].filter(Boolean).join(' · ')}</Body>
            <Label>{s.today}</Label>
            {slots(x).map((slot) => (
              <Pressable key={slot} accessibilityRole="checkbox" accessibilityState={{ checked: taken(x, slot) }} onPress={() => toggle(x, slot)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: c.accent, backgroundColor: taken(x, slot) ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  {taken(x, slot) ? <Text style={{ color: c.onAccent }}>✓</Text> : null}
                </View>
                <Body>{slot ? slot : s.taken}</Body>
              </Pressable>
            ))}
            <Link2 title={open === x.id ? '▲' : `▼ ${s.info}`} onPress={() => setOpen(open === x.id ? null : x.id)} />
            {open === x.id && (<View>
              {k ? <Body small>{k.summary}</Body> : null}
              {w.map((m, j) => <View key={j} style={{ marginTop: 6 }}><Badge tone={tone(m.level)} text={s.levels[m.level]} /><Body small style={{ marginTop: 4 }}>{m.text}</Body></View>)}
            </View>)}
            <Link2 title={s.stop} onPress={() => stop(x)} />
          </Card>
        );
      })}

      {adding ? (
        <Card>
          <H2>{s.add}</H2>
          <Field label={s.name} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} maxLength={80} />
          {f.name.trim().length >= 3 && warningsFor(preview, health?.medications ?? null, health?.conditions ?? null, authorized).map((m, j) => (
            <View key={j} style={{ marginBottom: 6 }}><Badge tone={tone(m.level)} text={s.levels[m.level]} /><Body small style={{ marginTop: 4 }}>{m.text}</Body></View>
          ))}
          <Field label={s.dose} value={f.dose} onChangeText={(v) => setF({ ...f, dose: v })} maxLength={80} />
          <Field label={s.freq} value={f.freq} onChangeText={(v) => setF({ ...f, freq: v })} maxLength={80} />
          <Field label={s.times} value={f.times} onChangeText={(v) => setF({ ...f, times: v })} placeholder="08:00, 20:00" />
          <Field label={s.notes} value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline maxLength={300} />
          <ErrorText>{error}</ErrorText>
          <Button title={s.save} onPress={add} />
          <Button title={t.common.cancel} variant="ghost" onPress={() => { setAdding(false); setError(null); }} />
        </Card>
      ) : <Button title={s.add} onPress={() => setAdding(true)} />}
      {!adding && <ErrorText>{error}</ErrorText>}
    </Screen>
  );
}
