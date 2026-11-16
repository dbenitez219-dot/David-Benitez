import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { csv, formatDate, num, parseDate, validTime } from '@/lib/calc';
import { tr, fmt } from '@/i18n';
import { font, useTheme } from '@/lib/theme';
import { Body, Button, Chip, ChipRow, ErrorText, Field, H1, Label, ProgressBar, Screen } from '@/ui';

const SEX = ['female', 'male', 'intersex', 'prefer_not_say'] as const;
const ACT = ['sedentary', 'light', 'moderate', 'high', 'athlete'] as const;
const EXP = ['none', 'beginner', 'intermediate', 'advanced'] as const;
const PLACE = ['home', 'gym', 'both'] as const;
const EQUIP = ['bodyweight', 'dumbbells', 'bands', 'barbell', 'machines', 'kettlebell', 'bench', 'pullup'] as const;
const GOALS = ['lose_fat', 'gain_muscle', 'glutes_legs', 'arms_back', 'endurance', 'fitness', 'maintain', 'habits'] as const;
const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
const TOTAL = 6;

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function Onboarding() {
  const t = tr(); const o = t.onboarding; const c = useTheme();
  const { session, profile, prefs, health, refresh } = useAuth();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const [f, setF] = useState(() => ({
    name: profile?.display_name ?? '', birth: formatDate(profile?.birth_date), sex: profile?.biological_sex ?? '', gender: profile?.gender_identity ?? '',
    height: profile?.height_cm?.toString() ?? '', weight: profile?.weight_kg?.toString() ?? '', target: profile?.target_weight_kg?.toString() ?? '',
    waist: '', hip: '', chest: '', arm: '', thigh: '',
    activity: prefs?.activity_level ?? '', exp: prefs?.training_experience ?? '', place: prefs?.training_place ?? '',
    equipment: prefs?.equipment ?? [], days: prefs?.training_days ?? [1, 2, 3, 4, 5], minutes: prefs?.session_minutes?.toString() ?? '45',
    fav: (prefs?.favorite_foods ?? []).join(', '), allergies: (health?.allergies ?? []).join(', '), restrictions: (health?.dietary_restrictions ?? []).join(', '),
    meals: { breakfast: '08:00', lunch: '13:00', snack: '17:00', dinner: '21:00', ...(prefs?.meal_times ?? {}) } as Record<string, string>,
    sleep: prefs?.sleep_hours_target?.toString() ?? '8', goals: prefs?.goals ?? [],
    injuries: health?.injuries ?? '', conditions: health?.conditions ?? '', meds: health?.medications ?? '', consent: !!health?.health_consent_at,
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  function validate(s: number): boolean {
    const e: Record<string, string> = {};
    const bad = o.invalid;
    if (s === 1) {
      if (!f.name.trim()) e.name = bad;
      if (!parseDate(f.birth)) e.birth = bad;
      if (!f.sex) e.sex = bad;
    }
    if (s === 2) {
      const h = num(f.height), w = num(f.weight);
      if (h === null || h < 100 || h > 250) e.height = bad;
      if (w === null || w < 25 || w > 400) e.weight = bad;
      if (f.target.trim() && (num(f.target) === null || num(f.target)! < 25 || num(f.target)! > 400)) e.target = bad;
      for (const k of ['waist', 'hip', 'chest', 'arm', 'thigh'] as const) if (f[k].trim() && (num(f[k]) === null || num(f[k])! < 10 || num(f[k])! > 250)) e[k] = bad;
    }
    if (s === 3) {
      if (!f.activity) e.activity = bad; if (!f.exp) e.exp = bad; if (!f.place) e.place = bad;
      if (f.days.length === 0) e.days = bad;
      const m = num(f.minutes); if (m === null || m < 10 || m > 240) e.minutes = bad;
    }
    if (s === 4) for (const k of MEALS) if (!validTime(f.meals[k] ?? '')) e[`meal_${k}`] = 'HH:MM';
    if (s === 5) {
      const h = num(f.sleep); if (h === null || h < 3 || h > 14) e.sleep = bad;
      if (f.goals.length === 0) e.goals = bad;
    }
    if (s === 6) {
      const hasHealth = [f.injuries, f.conditions, f.meds, f.allergies].some((x) => x.trim());
      if (hasHealth && !f.consent) e.consent = o.needHealthConsent;
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  async function finish() {
    if (!validate(6) || !session) return;
    setBusy(true); setError(null);
    const uid = session.user.id;
    try {
      const p = await supabase.from('profiles').update({
        display_name: f.name.trim(), birth_date: parseDate(f.birth), biological_sex: f.sex, gender_identity: f.gender.trim() || null,
        height_cm: num(f.height), weight_kg: num(f.weight), target_weight_kg: num(f.target),
        onboarding_completed_at: profile?.onboarding_completed_at ?? new Date().toISOString(),
      }).eq('id', uid);
      if (p.error) throw p.error;

      const pr = await supabase.from('preferences').update({
        goals: f.goals, activity_level: f.activity, training_experience: f.exp, training_place: f.place, equipment: f.equipment,
        training_days: [...f.days].sort(), session_minutes: Math.round(num(f.minutes)!), favorite_foods: csv(f.fav), meal_times: f.meals,
        sleep_hours_target: num(f.sleep), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      }).eq('user_id', uid);
      if (pr.error) throw pr.error;

      const hasHealth = [f.injuries, f.conditions, f.meds, f.allergies].some((x) => x.trim());
      const h = await supabase.from('health_profiles').update({
        injuries: f.injuries.trim() || null, conditions: f.conditions.trim() || null, medications: f.meds.trim() || null,
        allergies: csv(f.allergies), dietary_restrictions: csv(f.restrictions),
        health_consent_at: hasHealth && f.consent ? (health?.health_consent_at ?? new Date().toISOString()) : null,
      }).eq('user_id', uid);
      if (h.error) throw h.error;

      const today = new Date().toISOString().slice(0, 10);
      const m = await supabase.from('body_measurements').upsert({
        user_id: uid, measured_at: today, weight_kg: num(f.weight), waist_cm: num(f.waist), hip_cm: num(f.hip),
        chest_cm: num(f.chest), arm_cm: num(f.arm), thigh_cm: num(f.thigh),
      }, { onConflict: 'user_id,measured_at' });
      if (m.error) throw m.error;

      await refresh();
      router.replace('/');
    } catch (e: any) {
      setError(e?.message ?? t.common.error);
    } finally { setBusy(false); }
  }

  const next = () => { if (validate(step)) { setStep(step + 1); setError(null); } };
  const titles = [o.basics, o.body, o.activity, o.food, o.rest, o.health];
  const sel = (k: string) => errs[k] ? <ErrorText>{errs[k]}</ErrorText> : null;

  return (
    <Screen>
      <Label>{fmt(o.step, { n: step, total: TOTAL })}</Label>
      <ProgressBar value={step / TOTAL} />
      <View style={{ height: 20 }} />
      <H1>{titles[step - 1]}</H1>
      <View style={{ height: 16 }} />

      {step === 1 && (<>
        <Field label={t.auth.name} value={f.name} onChangeText={(v) => set('name', v)} error={errs.name} maxLength={60} />
        <Field label={o.birth} value={f.birth} onChangeText={(v) => set('birth', v)} placeholder="25/03/1994" keyboardType="numbers-and-punctuation" error={errs.birth} />
        <Label>{o.bioSex}</Label>
        <ChipRow>{SEX.map((s) => <Chip key={s} label={o.sex[s]} selected={f.sex === s} onPress={() => set('sex', s)} />)}</ChipRow>{sel('sex')}
        <Field label={o.gender} value={f.gender} onChangeText={(v) => set('gender', v)} maxLength={40} />
      </>)}

      {step === 2 && (<>
        <Field label={o.height} value={f.height} onChangeText={(v) => set('height', v)} keyboardType="decimal-pad" error={errs.height} />
        <Field label={o.weight} value={f.weight} onChangeText={(v) => set('weight', v)} keyboardType="decimal-pad" error={errs.weight} />
        <Field label={o.targetWeight} value={f.target} onChangeText={(v) => set('target', v)} keyboardType="decimal-pad" error={errs.target} />
        <Label>{o.measuresHint}</Label>
        {(['waist', 'hip', 'chest', 'arm', 'thigh'] as const).map((k) => (
          <Field key={k} label={o[k]} value={f[k]} onChangeText={(v) => set(k, v)} keyboardType="decimal-pad" error={errs[k]} />
        ))}
      </>)}

      {step === 3 && (<>
        <Label>{o.activityLevel}</Label>
        <ChipRow>{ACT.map((s) => <Chip key={s} label={o.act[s]} selected={f.activity === s} onPress={() => set('activity', s)} />)}</ChipRow>{sel('activity')}
        <Label>{o.experience}</Label>
        <ChipRow>{EXP.map((s) => <Chip key={s} label={o.exp[s]} selected={f.exp === s} onPress={() => set('exp', s)} />)}</ChipRow>{sel('exp')}
        <Label>{o.place}</Label>
        <ChipRow>{PLACE.map((s) => <Chip key={s} label={o.placeOpt[s]} selected={f.place === s} onPress={() => set('place', s)} />)}</ChipRow>{sel('place')}
        <Label>{o.equipment}</Label>
        <ChipRow>{EQUIP.map((s) => <Chip key={s} label={o.equip[s]} selected={f.equipment.includes(s)} onPress={() => set('equipment', toggle(f.equipment, s))} />)}</ChipRow>
        <Label>{o.days}</Label>
        <ChipRow>{t.days.map((d, i) => <Chip key={d} label={d} selected={f.days.includes(i + 1)} onPress={() => set('days', toggle(f.days, i + 1))} />)}</ChipRow>{sel('days')}
        <Field label={o.minutes} value={f.minutes} onChangeText={(v) => set('minutes', v)} keyboardType="number-pad" error={errs.minutes} />
      </>)}

      {step === 4 && (<>
        <Field label={o.favFoods} value={f.fav} onChangeText={(v) => set('fav', v)} multiline />
        <Field label={o.allergies} value={f.allergies} onChangeText={(v) => set('allergies', v)} />
        <Field label={o.restrictions} value={f.restrictions} onChangeText={(v) => set('restrictions', v)} />
        <Label>{o.mealTimes}</Label>
        {MEALS.map((k) => (
          <Field key={k} label={o.meal[k]} value={f.meals[k]} onChangeText={(v) => set('meals', { ...f.meals, [k]: v })} placeholder="08:00" keyboardType="numbers-and-punctuation" error={errs[`meal_${k}`]} />
        ))}
      </>)}

      {step === 5 && (<>
        <Field label={o.sleepHours} value={f.sleep} onChangeText={(v) => set('sleep', v)} keyboardType="decimal-pad" error={errs.sleep} />
        <Label>{o.goals}</Label>
        <ChipRow>{GOALS.map((g) => <Chip key={g} label={o.goal[g]} selected={f.goals.includes(g)} onPress={() => set('goals', toggle(f.goals, g))} />)}</ChipRow>{sel('goals')}
      </>)}

      {step === 6 && (<>
        <Body muted>{o.healthIntro}</Body>
        <View style={{ height: 14 }} />
        <Field label={o.injuries} value={f.injuries} onChangeText={(v) => set('injuries', v)} multiline maxLength={1000} />
        <Field label={o.conditions} value={f.conditions} onChangeText={(v) => set('conditions', v)} multiline maxLength={1000} />
        <Field label={o.medications} value={f.meds} onChangeText={(v) => set('meds', v)} multiline maxLength={1000} />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: f.consent }} onPress={() => set('consent', !f.consent)} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.accent, backgroundColor: f.consent ? c.accent : 'transparent', marginRight: 10, marginTop: 1, alignItems: 'center', justifyContent: 'center' }}>
            {f.consent ? <Text style={{ color: c.onAccent, fontSize: 14, fontFamily: font.semi }}>✓</Text> : null}
          </View>
          <View style={{ flex: 1 }}><Body>{o.healthConsent}</Body></View>
        </Pressable>
        {sel('consent')}
      </>)}

      <ErrorText>{error}</ErrorText>
      {step < TOTAL
        ? <Button title={t.common.continue} onPress={next} />
        : <Button title={o.finish} onPress={finish} loading={busy} />}
      {step > 1 ? <Button title={t.common.back} variant="ghost" onPress={() => { setStep(step - 1); setErrs({}); }} /> : null}
      {profile?.onboarding_completed_at ? <Button title={t.common.cancel} variant="ghost" onPress={() => router.back()} /> : null}
    </Screen>
  );
}
