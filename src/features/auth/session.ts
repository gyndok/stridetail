import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/src/lib/supabase';

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
}

export async function signUp(email: string, password: string, displayName: string) {
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
