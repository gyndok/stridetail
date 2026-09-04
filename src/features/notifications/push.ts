// Staff push registration (beta round 4, wish-list #8: Alexandra — walkers
// should be notified when a visit offer needs review).
//
// BINARY GATE: expo-notifications is a native module that first ships in the
// 0.2.2 build. On older binaries the require would blow up at module load, so
// this file must never import it statically — everything goes through a lazy
// require guarded by the runtime version (the videoSupport.ts pattern; the
// runtimeVersion policy is appVersion, so the binary's runtime version IS its
// app version).
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';

import { supabase } from '@/src/lib/supabase';

export function pushSupportedFor(runtimeVersion: string | null | undefined): boolean {
  if (Platform.OS === 'web') return false;
  if (!runtimeVersion) return true; // dev client — let devs test
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(runtimeVersion);
  if (!m) return false; // unrecognized custom runtime — fail closed
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (maj !== 0) return true;
  if (min !== 2) return min > 2;
  return pat >= 2; // 0.2.2 is the first binary bundling expo-notifications
}

export function pushSupported(): boolean {
  return pushSupportedFor(Updates.runtimeVersion);
}

/**
 * Ask for permission (iOS prompts once) and store this device's Expo push
 * token under the signed-in user. Safe to call on every app start: an
 * existing token upserts onto its own row, denial/no-support is a quiet
 * no-op, and every failure is swallowed — push is never worth breaking
 * startup over.
 */
export async function registerForPush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    // Lazy: resolved only on binaries that bundle the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: session.user.id,
          token,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      );
  } catch {
    // Missing native module, simulator without push, network — all non-fatal.
  }
}
