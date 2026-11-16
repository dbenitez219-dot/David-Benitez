import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Share, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useCouple } from '@/lib/useCouple';
import { confirmAction } from '@/lib/dialogs';
import { fmt, tr } from '@/i18n';
import { font, useTheme } from '@/lib/theme';
import { Body, Button, Card, ErrorText, Field, H1, H2, Screen } from '@/ui';

const CATS = ['workouts', 'weight', 'nutrition', 'water', 'sleep', 'streak', 'photos'] as const;

export default function Couple() {
  const t = tr(); const c = useTheme();
  const { session } = useAuth();
  const { status, loading, reload } = useCouple();
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const [code, setCode] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consents, setConsents] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!status?.linked || !session) return;
    supabase.from('sharing_consents').select('category, enabled').eq('user_id', session.user.id).then(({ data }) => {
      setConsents(Object.fromEntries((data ?? []).map((r) => [r.category, r.enabled])));
    });
  }, [status?.linked, session]);

  async function generate() {
    setBusy(true); setError(null);
    const { data, error: e } = await supabase.rpc('create_couple_invite');
    setBusy(false);
    if (e) return setError(e.message.includes('already_paired') ? t.couple.err.already_paired : e.message);
    setCode(data as string); reload();
  }
  async function redeem() {
    setBusy(true); setError(null);
    const { data, error: e } = await supabase.rpc('redeem_couple_invite', { p_code: input });
    setBusy(false);
    if (e) return setError(e.message);
    if (data !== 'ok') return setError(t.couple.err[data as keyof typeof t.couple.err] ?? t.common.error);
    setInput(''); setEntering(false); reload();
  }
  async function setConsent(cat: string, enabled: boolean) {
    if (!session) return;
    setConsents((p) => ({ ...p, [cat]: enabled }));
    const { error: e } = await supabase.from('sharing_consents').upsert({ user_id: session.user.id, category: cat, enabled }, { onConflict: 'user_id,category' });
    if (e) { setConsents((p) => ({ ...p, [cat]: !enabled })); setError(e.message); }
  }
  async function leave() {
    if (!(await confirmAction(t.couple.leave, t.couple.leaveConfirm, t.couple.leave, t.common.cancel))) return;
    const { error: e } = await supabase.rpc('leave_couple');
    if (e) setError(e.message); else { setCode(null); setConsents({}); reload(); }
  }
  async function shareCode() {
    if (!code) return;
    if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(code);
    else await Share.share({ message: code });
  }

  return (
    <Screen>
      <H1>{t.couple.title}</H1>
      <View style={{ height: 16 }} />
      {loading ? <Body muted>{t.common.loading}</Body> : status?.linked ? (<>
        <Card>
          <H2>{fmt(t.couple.linkedWith, { name: status.partner_name ?? '' })}</H2>
        </Card>
        <Card index={1}>
          <H2>{t.couple.consentsTitle}</H2>
          <Body muted small style={{ marginBottom: 8 }}>{t.couple.consentsHint}</Body>
          {CATS.map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
              <Body>{t.couple.cat[k]}</Body>
              <Switch value={!!consents[k]} onValueChange={(v) => setConsent(k, v)} trackColor={{ true: c.accent, false: c.track }} accessibilityLabel={t.couple.cat[k]} />
            </View>
          ))}
        </Card>
        <ErrorText>{error}</ErrorText>
        <Button title={t.couple.leave} variant="danger" onPress={leave} />
      </>) : (<>
        <Body muted>{t.couple.intro}</Body>
        <View style={{ height: 16 }} />
        {code ? (
          <Card>
            <Body muted small>{t.couple.yourCode}</Body>
            <Text selectable style={{ fontFamily: font.display, fontSize: 36, letterSpacing: 6, color: c.accent, marginVertical: 12 }}>{code}</Text>
            <Button title={t.couple.share} variant="ghost" onPress={shareCode} />
            <Body muted small style={{ marginTop: 10 }}>{t.couple.waiting}</Body>
          </Card>
        ) : null}
        {entering ? (<>
          <Field label={t.couple.enterCode} value={input} onChangeText={setInput} autoCapitalize="characters" autoCorrect={false} maxLength={12} />
          <Button title={t.couple.link} onPress={redeem} loading={busy} disabled={input.trim().length < 8} />
          <Button title={t.common.cancel} variant="ghost" onPress={() => { setEntering(false); setError(null); }} />
        </>) : (<>
          <Button title={t.couple.generate} onPress={generate} loading={busy} />
          <Button title={t.couple.haveCode} variant="ghost" onPress={() => { setEntering(true); setError(null); }} />
        </>)}
        <ErrorText>{error}</ErrorText>
      </>)}
    </Screen>
  );
}
