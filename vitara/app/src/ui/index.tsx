import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, useTheme } from '@/lib/theme';

export function Screen({ children, scroll = true, pad = true }: { children: React.ReactNode; scroll?: boolean; pad?: boolean }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const inner = { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, paddingHorizontal: pad ? 20 : 0 };
  const wrap = (
    <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', ...inner }}>{children}</View>
  );
  return scroll
    ? <ScrollView style={{ flex: 1, backgroundColor: c.bg }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>{wrap}</ScrollView>
    : <View style={{ flex: 1, backgroundColor: c.bg }}>{wrap}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return <Text accessibilityRole="header" style={{ fontFamily: font.display, fontSize: 30, lineHeight: 36, color: c.ink, letterSpacing: -0.5 }}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return <Text accessibilityRole="header" style={{ fontFamily: font.semi, fontSize: 17, color: c.ink, marginBottom: 8 }}>{children}</Text>;
}
export function Body({ children, muted, small, style }: { children: React.ReactNode; muted?: boolean; small?: boolean; style?: object }) {
  const c = useTheme();
  return <Text style={[{ fontFamily: font.body, fontSize: small ? 13 : 15, lineHeight: small ? 18 : 22, color: muted ? c.muted : c.ink }, style]}>{children}</Text>;
}
export function Label({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return <Text style={{ fontFamily: font.medium, fontSize: 12, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{children}</Text>;
}

export function Card({ children, index = 0, style }: { children: React.ReactNode; index?: number; style?: ViewStyle }) {
  const c = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(380)}
      style={[{ backgroundColor: c.card, borderRadius: radius.card, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, marginBottom: 14 }, style]}>
      {children}
    </Animated.View>
  );
}

export function Button({ title, onPress, variant = 'primary', loading, disabled }: { title: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean }) {
  const c = useTheme();
  const bg = variant === 'primary' ? c.accent : 'transparent';
  const fg = variant === 'primary' ? c.onAccent : variant === 'danger' ? c.danger : c.accent;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || loading) }} disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: bg, borderRadius: radius.pill, paddingVertical: 15, paddingHorizontal: 22, alignItems: 'center', opacity: disabled ? 0.45 : pressed ? 0.8 : 1, marginTop: 8, borderWidth: variant === 'primary' ? 0 : 1, borderColor: variant === 'danger' ? c.danger : c.line })}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ fontFamily: font.semi, fontSize: 15, color: fg }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const c = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      <TextInput placeholderTextColor={c.muted} {...props}
        style={[{ fontFamily: font.body, fontSize: 16, color: c.ink, backgroundColor: c.card, borderRadius: radius.input, borderWidth: 1, borderColor: error ? c.danger : c.line, paddingHorizontal: 14, paddingVertical: Platform.OS === 'web' ? 12 : 13 }, props.multiline && { minHeight: 80, textAlignVertical: 'top' }]} />
      {error ? <Text style={{ fontFamily: font.body, fontSize: 12, color: c.danger, marginTop: 4 }}>{error}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.pill, marginRight: 8, marginBottom: 8, backgroundColor: selected ? c.accent : c.card, borderWidth: 1, borderColor: selected ? c.accent : c.line }}>
      <Text style={{ fontFamily: font.medium, fontSize: 14, color: selected ? c.onAccent : c.ink }}>{label}</Text>
    </Pressable>
  );
}
export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>{children}</View>;
}

export function ProgressBar({ value }: { value: number }) {
  const c = useTheme();
  return (
    <View accessibilityRole="progressbar" style={{ height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: c.accent }} />
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  const c = useTheme();
  return children ? <Text accessibilityRole="alert" style={{ fontFamily: font.body, fontSize: 13, color: c.danger, marginVertical: 8 }}>{children}</Text> : null;
}
