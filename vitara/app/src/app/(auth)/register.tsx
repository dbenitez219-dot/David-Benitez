import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { tr } from '@/i18n';
import { Body, Button, ErrorText, Field, H1, Screen } from '@/ui';
import { font, useTheme } from '@/lib/theme';

export default function Register() {
  const t = tr(); const c = useTheme();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    setError(null); setInfo(null);
    if (!name.trim()) return setError(t.auth.nameRequired);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t.auth.invalidEmail);
    if (password.length < 8) return setError(t.auth.weakPassword);
    if (!accepted) return setError(t.auth.termsRequired);
    setBusy(true);
    const { data, error: e } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() } } });
    setBusy(false);
    if (e) return setError(e.message);
    if (!data.session) setInfo(t.auth.checkEmail); // con confirmación de correo activada
  }

  return (
    <Screen>
      <View style={{ marginTop: 32 }} />
      <H1>{t.auth.register}</H1>
      <View style={{ height: 20 }} />
      <Field label={t.auth.name} value={name} onChangeText={setName} autoComplete="name" maxLength={60} />
      <Field label={t.auth.email} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={`${t.auth.password} · ${t.auth.passwordHint}`} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted(!accepted)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.accent, backgroundColor: accepted ? c.accent : 'transparent', marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
          {accepted ? <Text style={{ color: c.onAccent, fontSize: 14 }}>✓</Text> : null}
        </View>
        <Body>{t.auth.acceptTerms} (<Link href="/privacidad" style={{ color: c.accent }}>ver</Link>)</Body>
      </Pressable>
      <ErrorText>{error}</ErrorText>
      {info ? <Body style={{ color: c.accent, marginVertical: 8 }}>{info}</Body> : null}
      <Button title={t.auth.register} onPress={submit} loading={busy} />
      <Link href="/login" style={{ marginTop: 20, textAlign: 'center', color: c.accent, fontFamily: font.medium }}>{t.auth.haveAccount}</Link>
    </Screen>
  );
}
