import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { callFn } from '@/lib/api';
import { tr } from '@/i18n';
import { Body, Button, ErrorText, Field } from './index';
import { useTheme } from '@/lib/theme';

type M = { role: 'user' | 'assistant'; content: string };

/** Chat con el entrenador (Edge Function coach-chat). Conoce el perfil con autorización y el ejercicio actual. */
export function CoachChat({ exerciseId }: { exerciseId?: string }) {
  const t = tr(); const c = useTheme();
  const [msgs, setMsgs] = useState<M[]>([]); const [text, setText] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function send() {
    const q = text.trim(); if (!q || busy) return;
    const next: M[] = [...msgs, { role: 'user', content: q }];
    setMsgs(next); setText(''); setBusy(true); setError(null);
    try {
      const { reply } = await callFn<{ reply: string }>('coach-chat', { messages: next, exercise_id: exerciseId });
      setMsgs([...next, { role: 'assistant', content: reply }]);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <View style={{ marginTop: 8 }}>
      {msgs.map((m, i) => (
        <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', backgroundColor: m.role === 'user' ? c.accentSoft : c.track, borderRadius: 14, padding: 10, marginBottom: 6, maxWidth: '90%' }}>
          <Body small>{m.content}</Body>
        </View>
      ))}
      {busy ? <ActivityIndicator color={c.accent} style={{ marginVertical: 6 }} /> : null}
      <ErrorText>{error}</ErrorText>
      <Field label={t.train.ask} value={text} onChangeText={setText} placeholder={t.train.askPlaceholder} maxLength={500} onSubmitEditing={send} />
      <Button title={t.train.send} variant="ghost" onPress={send} disabled={!text.trim() || busy} />
    </View>
  );
}
