import { supabase } from '@/src/lib/supabase';

import type { ClientAccessCodes, ClientAccessInput } from '@/src/features/clients/access';

/**
 * Client-own access-code RPCs (Plan 8 Task 6,
 * supabase/migrations/20260826000005_client_access_self_service.sql) — the
 * portal twins of src/features/clients/access.ts. Same spec-§8 rules:
 * revealed values are NEVER cached; callers keep them in component state
 * only (no react-query, no storage) and wipe on blur/unmount.
 */

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** "Codes on file" indicator — never decrypts. Linked-client-only (raises otherwise). */
export async function hasClientAccessSelf(clientId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_client_access_self', { p_client: clientId });
  if (error) throw error;
  return data === true;
}

/**
 * Decrypt and return the caller's own codes. Every call writes an audit_log
 * row (`client_access.self_reveal`) server-side. Null when nothing on file.
 */
export async function revealClientAccessSelf(clientId: string): Promise<ClientAccessCodes | null> {
  const { data, error } = await supabase.rpc('reveal_client_access_self', { p_client: clientId });
  if (error) throw error;
  const rows = (data ?? []) as ClientAccessCodes[];
  return rows[0] ?? null;
}

/** Encrypt and upsert the full set of codes; audited (`client_access.self_set`). */
export async function setClientAccessSelf(
  clientId: string,
  input: ClientAccessInput,
): Promise<void> {
  const { error } = await supabase.rpc('set_client_access_self', {
    p_client: clientId,
    p_door: orNull(input.door),
    p_lockbox: orNull(input.lockbox),
    p_gate: orNull(input.gate),
    p_alarm: orNull(input.alarm),
    p_key_location: orNull(input.keyLocation),
    p_notes: orNull(input.notes),
  });
  if (error) throw error;
}
