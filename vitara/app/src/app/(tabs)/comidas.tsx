import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { callFn } from '@/lib/api';
import { isoWeekday } from '@/lib/calc';
import { localDate } from '@/lib/dates';
import { confirmAction } from '@/lib/dialogs';
import { tr } from '@/i18n';
import { Body, Button, Card, ErrorText, H1, H2, Label, ProgressBar, Screen } from '@/ui';
import { Badge, Link2, Row } from '@/ui/Bits';

export type Targets = { kcal: number; protein_g: number; carbs_g: number; fat_g: number; water_ml: number; notes: string[]; flags: string[] };
export type PlannedMeal = { type: string; title: string; items: { name: string; grams: number; kcal: number }[]; recipe?: string };
export type NPlan = { days: { day: number; meals: PlannedMeal[]; totals: { kcal: number } }[]; shopping_list: { category: string; items: string[] }[]; substitutions: { food: string; alternatives: string[] }[]; notes: string[] };
type Log = { meal_type: string; status: 'logged' | 'incident'; kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; incident_reason: string | null };
const TYPES = ['breakfast', 'lunch', 'snack', 'dinner'] as const;

export default function Meals() {
  const t = tr(); const m = t.meals; const { session, prefs } = useAuth();
  const [plan, setPlan] = useState<{ targets: Targets; plan: NPlan } | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [p, l] = await Promise.all([
      supabase.from('nutrition_plans').select('targets,plan').eq('user_id', session.user.id).eq('active', true).maybeSingle(),
      supabase.from('meal_logs').select('meal_type,status,kcal,protein_g,carbs_g,fat_g,incident_reason').eq('user_id', session.user.id).eq('log_date', localDate()),
    ]);
    setPlan(p.data as any); setLogs((l.data ?? []) as Log[]); setLoading(false);
  }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function generate() {
    if (plan && !(await confirmAction(m.regenerate, m.regenConfirm, m.regenerate, t.common.cancel))) return;
    setBusy(true); setError(null);
    try { await callFn('generate-nutrition-plan'); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') => Math.round(logs.filter((l) => l.status === 'logged').reduce((a, l) => a + (l[k] ?? 0), 0));
  const dayPlan = plan?.plan.days[(isoWeekday() - 1) % (plan.plan.days.length || 1)];
  const times = prefs?.meal_times ?? {};

  return (
    <Screen>
      <H1>{m.title}</H1>
      <View style={{ height: 16 }} />
      {loading ? <Body muted>{t.common.loading}</Body> : (<>
        {plan ? (
          <Card>
            <Label>{m.todayTotals}</Label>
            <H2>{sum('kcal')} / {plan.targets.kcal} {m.kcal}</H2>
            <ProgressBar value={sum('kcal') / plan.targets.kcal} />
            <View style={{ height: 10 }} />
            <Body small muted>{m.protein} {sum('protein_g')}/{plan.targets.protein_g} g · {m.carbs} {sum('carbs_g')}/{plan.targets.carbs_g} g · {m.fat} {sum('fat_g')}/{plan.targets.fat_g} g</Body>
            <Body small muted style={{ marginTop: 4 }}>{m.approx}</Body>
          </Card>
        ) : null}

        {TYPES.map((ty, i) => {
          const log = logs.find((l) => l.meal_type === ty);
          const planned = dayPlan?.meals.find((x) => x.type === ty);
          return (
            <Card key={ty} index={i}>
              <Row>
                <H2>{m.names[ty]}{times[ty] ? ` · ${times[ty]}` : ''}</H2>
                {log ? <Badge tone={log.status === 'logged' ? 'good' : 'warn'} text={log.status === 'logged' ? (log.kcal != null ? `${m.logged} · ${Math.round(log.kcal)} ${m.kcal}` : m.logged) : m.incident} /> : <Badge text={m.pending} />}
              </Row>
              {planned ? <Body small muted>{m.planned}: {planned.title || planned.items.map((x) => x.name).join(', ')}</Body> : null}
              {log?.status === 'incident' ? <Body small muted>{log.incident_reason}</Body> : null}
              <Button title={log ? t.meal.replace : m.photo} variant={log ? 'ghost' : 'primary'} onPress={() => router.push({ pathname: '/comida', params: { type: ty } })} />
            </Card>
          );
        })}

        {plan ? (<>
          <Link2 title={m.viewPlan} onPress={() => router.push('/plan-nutricion')} />
          <Button title={m.regenerate} variant="ghost" onPress={generate} loading={busy} />
        </>) : (
          <Card>
            <H2>{m.noPlan}</H2><Body muted>{m.noPlanHint}</Body>
            <Button title={busy ? m.generating : m.generate} onPress={generate} loading={busy} />
          </Card>
        )}
        <ErrorText>{error}</ErrorText>
      </>)}
    </Screen>
  );
}
