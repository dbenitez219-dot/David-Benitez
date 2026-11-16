import { useState } from 'react';
import { View } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { tr } from '@/i18n';
import { Body, Button, ErrorText, Field, H1, Screen } from '@/ui';
import { useTheme, font } from '@/lib/theme';
import { Text } from 'react-native';

export default function Login() {
  const t = tr(); const c = useTheme();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t.auth.invalidEmail);
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (e) setError(e.message.toLowerCase().includes('invalid') ? t.auth.invalidCredentials : e.message);
  }

  return (
    <Screen>
      <View style={{ marginTop: 48, marginBottom: 32 }}>
        <Text style={{ fontFamily: font.display, fontSize: 40, color: c.accent, letterSpacing: 6 }}>{t.appName}</Text>
        <Body muted style={{ marginTop: 6 }}>{t.tagline}</Body>
      </View>
      <H1>{t.auth.login}</H1>
      <View style={{ height: 20 }} />
      <Field label={t.auth.email} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label={t.auth.password} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
      <ErrorText>{error}</ErrorText>
      <Button title={t.auth.login} onPress={submit} loading={busy} disabled={!email || !password} />
      <Link href="/register" style={{ marginTop: 20, textAlign: 'center', color: c.accent, fontFamily: font.medium }}>{t.auth.noAccount}</Link>
    </Screen>
  );
}
