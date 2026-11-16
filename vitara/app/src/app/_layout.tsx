import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { isConfigured } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Body, H1, Screen } from '@/ui';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Routes() {
  const { session, loading } = useAuth();
  const c = useTheme();
  if (loading) return <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}><ActivityIndicator color={c.accent} /></View>;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'fade' }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Screen name="privacidad" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Fraunces_600SemiBold });
  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync().catch(() => {}); }, [fontsLoaded]);
  if (!fontsLoaded) return null;

  if (!isConfigured) {
    return (
      <SafeAreaProvider>
        <Screen>
          <H1>Falta configurar Supabase</H1>
          <Body muted style={{ marginTop: 12 }}>
            Copiá .env.example a .env y completá EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY. Después reiniciá con «npx expo start -c».
          </Body>
        </Screen>
      </SafeAreaProvider>
    );
  }
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Routes />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
