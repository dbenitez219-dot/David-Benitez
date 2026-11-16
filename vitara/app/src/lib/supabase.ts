import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { authStorage } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anon);

// Solo clave anon (pública). La seguridad real la imponen las reglas RLS del servidor.
export const supabase = createClient(url ?? 'http://localhost', anon ?? 'missing', {
  auth: { storage: authStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
