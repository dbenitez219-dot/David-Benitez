import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// SecureStore limita ~2 KB por valor; la sesión de Supabase es más grande, así que se divide en trozos.
const CHUNK = 1800;
const native = {
  async getItem(key: string) {
    const n = await SecureStore.getItemAsync(`${key}.n`);
    if (!n) return null;
    let out = '';
    for (let i = 0; i < Number(n); i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part == null) return null;
      out += part;
    }
    return out;
  },
  async setItem(key: string, value: string) {
    await native.removeItem(key);
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [''];
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(`${key}.${i}`, parts[i]);
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
  },
  async removeItem(key: string) {
    const n = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

const web = {
  getItem: async (k: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(k)),
  setItem: async (k: string, v: string) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); },
  removeItem: async (k: string) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); },
};

export const authStorage = Platform.OS === 'web' ? web : native;
