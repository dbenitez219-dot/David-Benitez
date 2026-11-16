import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { hydrationTargetMl, isoWeekday } from '@/lib/calc';
import { useCouple } from '@/lib/useCouple';
import { fmt, tr } from '@/i18n';
import { useTheme } from '@/lib/theme';
import { Body, Card, H1, H2, Label, ProgressBar, Screen } from '@/ui';

export default function Today() {
  const t = tr(); const c = useTheme();
  const { profile, prefs } = useAuth();
  const couple = useCouple();
  useFocusEffect(useCallback(() => { couple.reload(); }, [couple.reload]));

  const today = isoWeekday();
  const isTraining = prefs?.training_days?.includes(today) ?? false;
  const water = hydrationTargetMl(profile?.weight_kg);
  const w = profile?.weight_kg, tw = profile?.target_weight_kg;
  const diff = w != null && tw != null ? Math.round((w - tw) * 10) / 10 : null;

  return (
    <Screen>
      <Label>{t.daysLong[today - 1]}</Label>
      <H1>{fmt(t.today.greeting, { name: profile?.display_name ?? '' })}</H1>
      <View style={{ height: 20 }} />

      <Card index={0}>
        <Label>{t.today.trainer}</Label>
        <H2>{isTraining ? t.today.trainingDay : t.today.restDay}</H2>
        <Body muted>{isTraining ? t.today.trainerSoon : t.today.restHint}</Body>
      </Card>

      <Card index={1}>
        <Label>{t.today.water}</Label>
        <H2>{water ? `${(water / 1000).toLocaleString('es', { minimumFractionDigits: 1 })} L` : '—'}</H2>
        <Body muted small>{t.today.waterHint}</Body>
      </Card>

      {w != null && (
        <Card index={2}>
          <Label>{t.today.weight}</Label>
          <H2>{w.toLocaleString('es')} kg</H2>
          {diff != null && tw != null && <>
            <Body muted small style={{ marginBottom: 8 }}>{t.today.toTarget}: {tw.toLocaleString('es')} kg · {diff > 0 ? `−${diff}` : diff < 0 ? `+${Math.abs(diff)}` : '0'} kg</Body>
            <ProgressBar value={diff === 0 ? 1 : Math.max(0, 1 - Math.abs(diff) / Math.max(w, tw))} />
          </>}
        </Card>
      )}

      <Card index={3}>
        <Label>{t.today.partner}</Label>
        <Body>{couple.status?.linked ? fmt(t.today.partnerLinked, { name: couple.status.partner_name ?? '' }) : t.today.partnerNone}</Body>
      </Card>

      <Card index={4} style={{ backgroundColor: c.accentSoft }}>
        <Label>{t.today.soon}</Label>
        <Body>{t.today.mealsSoon}</Body>
        <Body muted small style={{ marginTop: 6 }}>{t.today.supps} · {t.today.sleep} · {t.today.streak}</Body>
      </Card>

      <Body muted small style={{ textAlign: 'center', marginTop: 8 }}>{t.today.disclaimer}</Body>
    </Screen>
  );
}
