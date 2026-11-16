import { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { ageFrom } from '@/lib/calc';
import { confirmAction, notify } from '@/lib/dialogs';
import { tr } from '@/i18n';
import { font, useTheme } from '@/lib/theme';
import { Body, Button, Card, ErrorText, H1, H2, Screen } from '@/ui';

export default function ProfileScreen() {
  const t = tr(); const c = useTheme();
  const { profile, prefs, session, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true); setError(null);
    const { data, error: e } = await supabase.rpc('export_my_data');
    setBusy(false);
    if (e) return setError(e.message);
    const json = JSON.stringify(data, null, 2);
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'vitara-mis-datos.json'; a.click(); URL.revokeObjectURL(url);
    } else await Share.share({ message: json, title: 'vitara-mis-datos.json' });
    notify(t.profile.exported);
  }
  async function deleteAccount() {
    if (!(await confirmAction(t.profile.delete, t.profile.deleteConfirm, t.profile.delete, t.common.cancel))) return;
    setBusy(true);
    const { error: e } = await supabase.rpc('delete_my_account');
    setBusy(false);
    if (e) return setError(e.message);
    await supabase.auth.signOut();
  }

  const age = ageFrom(profile?.birth_date);
  const rows: [string, string][] = [
    ['Correo', session?.user.email ?? ''],
    ['Edad', age != null ? `${age} años` : '—'],
    ['Altura', profile?.height_cm ? `${profile.height_cm} cm` : '—'],
    ['Peso', profile?.weight_kg ? `${profile.weight_kg} kg` : '—'],
    ['Días de entrenamiento', prefs?.training_days?.map((d) => t.days[d - 1]).join(' ') ?? '—'],
  ];

  return (
    <Screen>
      <H1>{profile?.display_name || t.profile.title}</H1>
      <View style={{ height: 16 }} />
      <Card>
        <H2>{t.profile.data}</H2>
        {rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
            <Body muted>{k}</Body><Body style={{ fontFamily: font.medium }}>{v}</Body>
          </View>
        ))}
      </Card>
      <Button title={t.profile.edit} onPress={() => router.push('/onboarding')} />
      <Button title={t.profile.export} variant="ghost" onPress={exportData} loading={busy} />
      <Link href="/privacidad" style={{ textAlign: 'center', color: c.accent, fontFamily: font.medium, marginVertical: 16 }}>{t.profile.privacy}</Link>
      <ErrorText>{error}</ErrorText>
      <Button title={t.profile.signOut} variant="ghost" onPress={signOut} />
      <Button title={t.profile.delete} variant="danger" onPress={deleteAccount} />
    </Screen>
  );
}
