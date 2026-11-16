import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export type PushResult = 'ok' | 'denied' | 'web' | 'no_project' | 'error';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** Pide permiso (en contexto, cuando el usuario toca el botón) y guarda el token de este dispositivo. */
export async function registerForPush(userId: string): Promise<PushResult> {
  if (Platform.OS === 'web') return 'web';
  try {
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Recordatorios', importance: Notifications.AndroidImportance.DEFAULT });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return 'no_project';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.from('push_tokens').upsert({ token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() }, { onConflict: 'token' });
    return error ? 'error' : 'ok';
  } catch { return 'error'; }
}
