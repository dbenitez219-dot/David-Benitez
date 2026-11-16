import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/auth/AuthProvider';
import { tr } from '@/i18n';
import { font, useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = tr(); const c = useTheme();
  const { profile } = useAuth();
  if (profile && !profile.onboarding_completed_at) return <Redirect href="/onboarding" />;
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.muted,
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
      tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: t.tabs.today, tabBarIcon: ({ color, size }) => <Ionicons name="sunny-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="pareja" options={{ title: t.tabs.couple, tabBarIcon: ({ color, size }) => <Ionicons name="heart-outline" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="perfil" options={{ title: t.tabs.profile, tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={String(color)} size={size} /> }} />
    </Tabs>
  );
}
