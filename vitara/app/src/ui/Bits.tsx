import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { font, radius, useTheme } from '@/lib/theme';
import { Body } from './index';

export function Row({ children, between = true }: { children: React.ReactNode; between?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: between ? 'space-between' : 'flex-start' }}>{children}</View>;
}
export function Badge({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'good' | 'warn' }) {
  const c = useTheme();
  const bg = tone === 'good' ? c.accentSoft : tone === 'warn' ? '#F6E4D6' : c.track;
  const fg = tone === 'good' ? c.accent : tone === 'warn' ? c.warn : c.muted;
  return <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ fontFamily: font.medium, fontSize: 12, color: fg }}>{text}</Text></View>;
}
export function Link2({ title, onPress }: { title: string; onPress: () => void }) {
  const c = useTheme();
  return <Pressable accessibilityRole="link" onPress={onPress} style={{ paddingVertical: 8 }}><Text style={{ fontFamily: font.medium, fontSize: 14, color: c.accent }}>{title}</Text></Pressable>;
}
export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  const c = useTheme();
  return <View style={{ backgroundColor: tone === 'warn' ? '#F6E4D6' : c.accentSoft, borderRadius: radius.input, padding: 12, marginVertical: 8 }}><Body small>{children}</Body></View>;
}
export function Empty({ children }: { children: React.ReactNode }) { return <Body muted style={{ marginVertical: 8 }}>{children}</Body>; }
