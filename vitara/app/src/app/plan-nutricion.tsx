import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { tr } from '@/i18n';
import { Body, Card, Chip, ChipRow, H1, H2, Label, Screen } from '@/ui';
import { Link2, Notice } from '@/ui/Bits';
import type { NPlan, Targets } from './(tabs)/comidas';

export default function NutritionPlan() {
  const t = tr(); const m = t.meals; const { session } = useAuth();
  const [data, setData] = useState<{ targets: Targets; plan: NPlan } | null>(null);
  const [day, setDay] = useState(0);
  useEffect(() => {
    if (!session) return;
    supabase.from('nutrition_plans').select('targets,plan').eq('user_id', session.user.id).eq('active', true).maybeSingle().then(({ data: d }) => setData(d as any));
  }, [session]);
  if (!data) return <Screen><Link2 title={`‹ ${t.common.back}`} onPress={() => router.back()} /><Body muted>{t.common.loading}</Body></Screen>;
  const { targets, plan } = data; const d = plan.days[day];
  return (
    <Screen>
      <Link2 title={`‹ ${t.common.back}`} onPress={() => router.back()} />
      <H1>{m.planTitle}</H1>
      <View style={{ height: 12 }} />
      {targets.flags?.map((f) => <Notice key={f} tone="warn">{(m.flags as Record<string, string>)[f] ?? f}</Notice>)}
      <Card>
        <H2>{m.targets}</H2>
        <Body>{targets.kcal} kcal · {m.protein} {targets.protein_g} g · {m.carbs} {targets.carbs_g} g · {m.fat} {targets.fat_g} g</Body>
        {targets.notes.map((n, i) => <Body key={i} small muted style={{ marginTop: 4 }}>{n}</Body>)}
        <Body small muted style={{ marginTop: 4 }}>{m.approx}</Body>
      </Card>
      <ChipRow>{plan.days.map((_, i) => <Chip key={i} label={t.days[i % 7]} selected={day === i} onPress={() => setDay(i)} />)}</ChipRow>
      {d && <>
        <Body muted small>{m.day} {day + 1} · {d.totals.kcal} kcal</Body>
        {d.meals.map((meal, i) => (
          <Card key={i} index={i}>
            <Label>{(m.names as Record<string, string>)[meal.type] ?? meal.type}</Label>
            <H2>{meal.title}</H2>
            {meal.items.map((it, k) => <Body key={k} small>• {it.name} — {it.grams} g · {Math.round(it.kcal)} kcal</Body>)}
            {meal.recipe ? <Body small muted style={{ marginTop: 6 }}>{m.recipe}: {meal.recipe}</Body> : null}
          </Card>
        ))}
      </>}
      <Card><H2>{m.shopping}</H2>{plan.shopping_list.map((g, i) => (<View key={i} style={{ marginBottom: 8 }}><Label>{g.category}</Label>{g.items.map((it, k) => <Body key={k} small>• {it}</Body>)}</View>))}</Card>
      {plan.substitutions.length > 0 && <Card><H2>{m.subs}</H2>{plan.substitutions.map((s, i) => <Body key={i} small>• {s.food}: {s.alternatives.join(', ')}</Body>)}</Card>}
      {plan.notes.length > 0 && <Card><H2>{m.notes}</H2>{plan.notes.map((n, i) => <Body key={i} small>• {n}</Body>)}</Card>}
    </Screen>
  );
}
