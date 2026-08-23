import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { AppState, Platform } from 'react-native';

import { env } from './env';
import { LargeSecureStore } from './secure-session-storage';

const nativeStorage = new LargeSecureStore({
  secureGet: (k) => SecureStore.getItemAsync(k),
  secureSet: (k, v) => (v ? SecureStore.setItemAsync(k, v) : SecureStore.deleteItemAsync(k)),
  kvGet: (k) => Storage.getItem(k),
  kvSet: (k, v) => Storage.setItem(k, v),
  kvRemove: (k) => Storage.removeItem(k),
  randomBytes: (n) => Crypto.getRandomBytes(n),
});

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : nativeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
