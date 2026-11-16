import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { callFn } from '@/lib/api';
import { localDate } from '@/lib/dates';
import { num } from '@/lib/calc';
import { tr } from '@/i18n';
import { useTheme } from '@/lib/theme';
import { Body, Button, Card, Chip, ChipRow, ErrorText, Field, H1, H2, Label, Screen } from '@/ui';
import { Badge, Link2, Notice, Row } from '@/ui/Bits';

type Item = { name: string; grams: number | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number; confidence?: string; source: 'ai' | 'user'; base?: { grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number } };
type Analysis = { identified: boolean; items: any[]; uncertainty_pct: number; unidentified: string[]; comment: string };
const r1 = (n: number) => Math.round(n * 10) / 10;

export default function Meal() {
  const t = tr(); const x = t.meal; const c = useTheme();
  const { type } = useLocalSearchParams<{ type: string }>();
  const { session } = useAuth();
  const [phase, setPhase] = useState<'pick' | 'analyzing' | 'review' | 'incident' | 'saving'>('pick');
  const [uri, setUri] = useState<string | null>(null); const [path, setPath] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]); const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [allergen, setAllergen] = useState<string[]>([]); const [edited, setEdited] = useState(false);
  const [error, setError] = useState<string | null>(null); const [exists, setExists] = useState(false);
  const [reason, setReason] = useState(''); const [reasonText, setReasonText] = useState('');
  const [nn, setNn] = useState({ name: '', kcal: '', p: '', c: '', f: '' });
  const mealName = (t.meals.names as Record<string, string>)[type ?? ''] ?? '';

  useEffect(() => {
    if (!session) return;
    supabase.from('meal_logs').select('id').eq('user_id', session.user.id).eq('log_date', localDate()).eq('meal_type', type).maybeSingle().then(({ data }) => setExists(!!data));
  }, [session, type]);

  async function capture(fromCamera: boolean) {
    setError(null);
    if (fromCamera && Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setError(x.cameraDenied);
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, allowsEditing: false, exif: false };
    const res = fromCamera && Platform.OS !== 'web' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    setUri(res.assets[0].uri);
    await upload(res.assets[0].uri);
  }

  async function upload(local: string) {
    if (!session) return;
    setPhase('analyzing');
    try {
      const blob = await (await fetch(local)).arrayBuffer();
      const p = `${session.user.id}/${localDate()}-${type}-${Date.now()}.jpg`;
      const up = await supabase.storage.from('meal-photos').upload(p, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      setPath(p);
      await analyze(p);
    } catch (e: any) { setError(e.message ?? x.analyzeFail); setPhase('review'); }
  }

  async function analyze(p: string) {
    setPhase('analyzing'); setError(null);
    try {
      const res = await callFn<{ analysis: Analysis; allergen_hits: string[] }>('analyze-meal', { photo_path: p, meal_type: type });
      setAnalysis(res.analysis); setAllergen(res.allergen_hits);
      setItems(res.analysis.items.map((i: any) => ({ ...i, source: 'ai' as const, base: i.grams ? { grams: i.grams, kcal: i.kcal, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g } : undefined })));
      if (!res.analysis.identified) setError(x.notFood);
    } catch (e: any) { setError(`${x.analyzeFail} ${e.message ?? ''}`); setAnalysis(null); }
    setPhase('review');
  }

  const setGrams = (i: number, v: string) => { setEdited(true); setItems((p) => p.map((it, k) => {
    if (k !== i) return it;
    const g = num(v);
    if (g === null || !it.base) return { ...it, grams: g };
    const f = g / it.base.grams; // las calorías y macros se ajustan en proporción a los gramos
    return { ...it, grams: g, kcal: r1(it.base.kcal * f), protein_g: r1(it.base.protein_g * f), carbs_g: r1(it.base.carbs_g * f), fat_g: r1(it.base.fat_g * f) };
  })); };
  const total = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') => r1(items.reduce((a, i) => a + i[k], 0));
  const unc = analysis?.uncertainty_pct ?? 30;

  function addManual() {
    const kcal = num(nn.kcal);
    if (!nn.name.trim() || kcal === null || kcal < 0) return setError(t.onboarding.invalid);
    setItems((p) => [...p, { name: nn.name.trim(), grams: null, kcal, protein_g: num(nn.p) ?? 0, carbs_g: num(nn.c) ?? 0, fat_g: num(nn.f) ?? 0, source: 'user' }]);
    setNn({ name: '', kcal: '', p: '', c: '', f: '' }); setEdited(true); setError(null);
  }

  async function save() {
    if (!session || !path) return setError(x.photoRequired);
    if (!items.length) return setError(x.noItems);
    setPhase('saving'); setError(null);
    const uid = session.user.id;
    try {
      if (exists) await supabase.from('meal_logs').delete().eq('user_id', uid).eq('log_date', localDate()).eq('meal_type', type);
      const ins = await supabase.from('meal_logs').insert({
        user_id: uid, log_date: localDate(), meal_type: type, status: 'logged', photo_path: path, ai_analysis: analysis,
        kcal: total('kcal'), protein_g: total('protein_g'), carbs_g: total('carbs_g'), fat_g: total('fat_g'), uncertainty_pct: Math.round(unc), user_corrected: edited,
      }).select('id').single();
      if (ins.error) throw ins.error;
      const rows = items.map((i) => ({ meal_log_id: ins.data.id, user_id: uid, name: i.name, grams: i.grams, kcal: i.kcal, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g, source: i.source }));
      const r = await supabase.from('meal_log_items').insert(rows);
      if (r.error) throw r.error;
      router.replace('/(tabs)/comidas');
    } catch (e: any) { setError(e.message ?? t.common.error); setPhase('review'); }
  }

  async function saveIncident() {
    if (!session) return;
    const why = [reason, reasonText.trim()].filter(Boolean).join(': ');
    if (why.length < 3) return setError(t.onboarding.invalid);
    setPhase('saving');
    const uid = session.user.id;
    if (exists) await supabase.from('meal_logs').delete().eq('user_id', uid).eq('log_date', localDate()).eq('meal_type', type);
    const { error: e } = await supabase.from('meal_logs').insert({ user_id: uid, log_date: localDate(), meal_type: type, status: 'incident', incident_reason: why.slice(0, 300) });
    if (e) { setError(e.message); setPhase('incident'); return; }
    router.replace('/(tabs)/comidas');
  }

  return (
    <Screen>
      <Link2 title={`‹ ${t.common.back}`} onPress={() => router.back()} />
      <H1>{`${x.title} · ${mealName}`}</H1>
      <View style={{ height: 12 }} />

      {phase === 'pick' && (<>
        {exists ? <Notice tone="warn">{x.exists}</Notice> : null}
        <Body muted>{x.photoRequired}</Body>
        <Button title={x.take} onPress={() => capture(true)} />
        <Button title={x.pick} variant="ghost" onPress={() => capture(false)} />
        <Link2 title={x.noPhoto} onPress={() => { setPhase('incident'); setError(null); }} />
        <ErrorText>{error}</ErrorText>
      </>)}

      {phase === 'incident' && (<>
        <H2>{x.incidentTitle}</H2>
        <Body muted small>{x.incidentHint}</Body>
        <View style={{ height: 8 }} />
        <Label>{x.reason}</Label>
        <ChipRow>{x.reasons.map((r) => <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />)}</ChipRow>
        <Field label={`${x.reason} (${t.common.optional})`} value={reasonText} onChangeText={setReasonText} maxLength={200} />
        <ErrorText>{error}</ErrorText>
        <Button title={x.incidentSave} onPress={saveIncident} />
        <Button title={t.common.back} variant="ghost" onPress={() => setPhase('pick')} />
      </>)}

      {(phase === 'analyzing' || phase === 'saving') && (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          {uri ? <Image source={{ uri }} style={{ width: 200, height: 200, borderRadius: 20, marginBottom: 16 }} /> : null}
          <ActivityIndicator color={c.accent} /><Body muted style={{ marginTop: 10 }}>{phase === 'analyzing' ? x.analyzing : x.saving}</Body>
        </View>
      )}

      {phase === 'review' && (<>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: 220, borderRadius: 20, marginBottom: 12 }} accessibilityLabel="Foto de tu comida" /> : null}
        <Link2 title={x.retake} onPress={() => { setUri(null); setPath(null); setItems([]); setAnalysis(null); setPhase('pick'); }} />
        <ErrorText>{error}</ErrorText>
        {path && !analysis ? <Button title={x.retry} variant="ghost" onPress={() => analyze(path)} /> : null}
        {allergen.length > 0 && <Notice tone="warn">{x.allergen}: {allergen.join(', ')}</Notice>}
        {analysis?.comment ? <Body muted small style={{ marginVertical: 6 }}>{analysis.comment}</Body> : null}

        <Card>
          <H2>{x.review}</H2>
          <Body small muted>{x.manualHint}</Body>
          {items.map((it, i) => (
            <View key={i} style={{ marginTop: 12 }}>
              <Row><Body style={{ flex: 1 }}>{it.name}</Body>
                {it.confidence ? <Badge tone={it.confidence === 'high' ? 'good' : it.confidence === 'low' ? 'warn' : 'neutral'} text={it.confidence} /> : <Badge text="✎" />}</Row>
              <Row>
                <View style={{ width: 120 }}><Field label={x.grams} value={it.grams != null ? String(it.grams) : ''} onChangeText={(v) => setGrams(i, v)} keyboardType="decimal-pad" /></View>
                <Body small muted>{Math.round(it.kcal)} kcal · P {it.protein_g} · C {it.carbs_g} · G {it.fat_g}</Body>
                <Link2 title="✕" onPress={() => { setItems((p) => p.filter((_, k) => k !== i)); setEdited(true); }} />
              </Row>
            </View>
          ))}
          {analysis && analysis.unidentified.length > 0 ? <Body small muted>{x.unidentified}: {analysis.unidentified.join(', ')}</Body> : null}
        </Card>

        <Card>
          <H2>{x.addItem}</H2>
          <Field label={x.itemName} value={nn.name} onChangeText={(v) => setNn({ ...nn, name: v })} />
          <Row><View style={{ flex: 1, marginRight: 6 }}><Field label="kcal" value={nn.kcal} onChangeText={(v) => setNn({ ...nn, kcal: v })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1, marginRight: 6 }}><Field label="P g" value={nn.p} onChangeText={(v) => setNn({ ...nn, p: v })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1, marginRight: 6 }}><Field label="C g" value={nn.c} onChangeText={(v) => setNn({ ...nn, c: v })} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Field label="G g" value={nn.f} onChangeText={(v) => setNn({ ...nn, f: v })} keyboardType="decimal-pad" /></View></Row>
          <Button title={x.addItem} variant="ghost" onPress={addManual} />
        </Card>

        <Card>
          <Label>{x.estimate}</Label>
          <H2>≈ {Math.round(total('kcal'))} kcal ({Math.round(total('kcal') * (1 - unc / 100))}–{Math.round(total('kcal') * (1 + unc / 100))})</H2>
          <Body small muted>P {total('protein_g')} g · C {total('carbs_g')} g · G {total('fat_g')} g · {x.uncertainty} ±{Math.round(unc)} %{edited ? ` · ${x.corrected}` : ''}</Body>
        </Card>
        <Button title={x.save} onPress={save} disabled={!path || !items.length} />
        <Link2 title={x.noPhoto} onPress={() => setPhase('incident')} />
      </>)}
    </Screen>
  );
}
