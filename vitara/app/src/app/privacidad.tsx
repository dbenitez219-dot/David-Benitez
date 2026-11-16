import { router } from 'expo-router';
import { tr } from '@/i18n';
import { Body, Button, H1, Screen } from '@/ui';

export default function Privacy() {
  const t = tr();
  return (
    <Screen>
      <H1>{t.privacy.title}</H1>
      {t.privacy.body.map((p, i) => <Body key={i} style={{ marginTop: 14 }}>{p}</Body>)}
      <Button title={t.common.back} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
