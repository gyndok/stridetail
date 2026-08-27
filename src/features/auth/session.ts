import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/src/lib/supabase';

import { clearPortalEntry, setPortalEntry } from './portalEntry';

export type SessionStatus = 'loading' | 'signed-out' | 'signed-in';
type State = { status: SessionStatus; userId: string | null };

export const useSessionStore = create<State>(() => ({ status: 'loading', userId: null }));

export function applyAuthEvent(session: Session | null) {
  useSessionStore.setState(
    session ? { status: 'signed-in', userId: session.user.id } : { status: 'signed-out', userId: null },
  );
}

export function initSession(): () => void {
  void supabase.auth.getSession().then(({ data }) => applyAuthEvent(data.session));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => applyAuthEvent(session));
  return () => data.subscription.unsubscribe();
}

export const useSession = () => useSessionStore();

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  await clearPortalEntry();
}

export async function signUp(email: string, password: string, displayName: string) {
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  await clearPortalEntry();
}

/**
 * Client-portal OTP (Plan 8 Task 2): email a 6-digit code. shouldCreateUser
 * is deliberate — a pet parent's first login IS their sign-up; the Task-3
 * linking RPC (or the portal's "no account found" state) takes it from there.
 * Marks the portal door so the router knows where a link-less user belongs.
 */
export async function requestPortalOtp(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
  await setPortalEntry();
}

/** Exchange the emailed 6-digit code for a session (same client, same encrypted store). */
export async function verifyPortalOtp(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
