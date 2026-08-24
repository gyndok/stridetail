import { supabase } from '@/src/lib/supabase';

/**
 * Thin wrappers over the client_access RPCs
 * (supabase/migrations/20260824000002_client_access.sql). The table itself has
 * no select policy and no grants — every read and write goes through these.
 *
 * Spec §8: revealed values are NEVER cached. Callers keep the result of
 * revealAccessOwner in component state only (no react-query, no storage).
 */

/** Shape returned by reveal_access_owner (one row per client, all columns nullable). */
export type ClientAccessCodes = {
  door_code: string | null;
  lockbox_code: string | null;
  gate_code: string | null;
  alarm_code: string | null;
  key_location: string | null;
  notes: string | null;
};

/** Caller-facing form values; empty/whitespace fields are stored as null. */
export type ClientAccessInput = {
  door: string;
  lockbox: string;
  gate: string;
  alarm: string;
  keyLocation: string;
  notes: string;
};

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** "Codes on file" indicator — never decrypts. Owner-only (the RPC raises otherwise). */
export async function hasClientAccess(clientId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_client_access', { p_client: clientId });
  if (error) throw error;
  return data === true;
}

/**
 * Decrypt and return the codes for one client. Every call writes an audit_log
 * row (`access.reveal_owner`) server-side. Null when no codes are on file.
 */
export async function revealAccessOwner(clientId: string): Promise<ClientAccessCodes | null> {
  const { data, error } = await supabase.rpc('reveal_access_owner', { p_client: clientId });
  if (error) throw error;
  const rows = (data ?? []) as ClientAccessCodes[];
  return rows[0] ?? null;
}

/** Reveal failure that keeps the HTTP status so callers can tell offline from denied. */
export class RevealAccessError extends Error {
  constructor(
    message: string,
    /** undefined = the server never answered (network); postgrest's 0 is normalized away. */
    public status?: number,
  ) {
    super(message);
    this.name = 'RevealAccessError';
  }
}

/**
 * Walker-side gated reveal (Plan 3 Task 2 RPC): only the assigned walker of an
 * in_progress visit; audited server-side (`access.reveal`). Same never-cache
 * rules as revealAccessOwner — values go to component state (+ the secure-store
 * grace copy via accessCache, the single spec-§8 exception).
 */
export async function revealAccessForVisit(visitId: string): Promise<ClientAccessCodes | null> {
  const { data, error, status } = await supabase.rpc('reveal_access', { p_visit: visitId });
  if (error) throw new RevealAccessError(error.message, status === 0 ? undefined : status);
  const rows = (data ?? []) as ClientAccessCodes[];
  return rows[0] ?? null;
}

/** Encrypt and upsert the full set of codes; audited server-side (`access.set`). */
export async function setClientAccess(clientId: string, input: ClientAccessInput): Promise<void> {
  const { error } = await supabase.rpc('set_client_access', {
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
