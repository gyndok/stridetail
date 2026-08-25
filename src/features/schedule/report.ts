import { formatInTimeZone } from 'date-fns-tz';

import { REPORT_BASE_URL } from '@/src/lib/brand';
import { supabase } from '@/src/lib/supabase';

/**
 * Owner-side visit report access (Plan 4 Task 7). Reads ride on the Task-1
 * owner select RLS policy; resend/revoke go through the audited owner-only
 * RPCs — the client never updates visit_reports directly (no update grant).
 *
 * COLUMN RULE: named columns only, and NEVER private_notes_md here — the
 * walker's private notes are not part of the owner report card (they surface
 * on the visit's own detail, not next to a shareable link).
 */

// sms_status is deliberately NOT read any more: the sms channel is dormant
// (migration 0013) and the delivery line reflects the email notification row
// instead (getReportEmailStatus below).
export const REPORT_COLUMNS = 'public_token, sent_at, revoked_at';

export type VisitReport = {
  public_token: string;
  sent_at: string | null;
  revoked_at: string | null;
};

export async function getVisitReport(businessId: string, visitId: string): Promise<VisitReport | null> {
  const { data, error } = await supabase
    .from('visit_reports')
    .select(REPORT_COLUMNS)
    .eq('business_id', businessId)
    .eq('visit_id', visitId)
    .maybeSingle();
  if (error) throw error;
  return (data as VisitReport | null) ?? null;
}

/** The exact link the client received by email (send-email builds it the same way). */
export function reportLink(token: string): string {
  return `${REPORT_BASE_URL.replace(/\/$/, '')}/${token}`;
}

/**
 * The email notification behind this visit's report: the LATEST channel='email'
 * visit_finished row whose payload names the visit (resends queue new rows —
 * the newest one is the delivery state the owner cares about). Owner-select
 * RLS on notifications scopes this to the owner. Null when nothing was ever
 * queued (the client had no email on file at finish time).
 */
export type ReportEmailStatus = {
  status: string;
  /** Sender-stamped on every transition; ≈ send time once status is 'sent'. */
  updated_at: string | null;
};

export async function getReportEmailStatus(
  businessId: string,
  visitId: string,
): Promise<ReportEmailStatus | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select('status, updated_at')
    .eq('business_id', businessId)
    .eq('channel', 'email')
    .eq('template', 'visit_finished')
    .eq('payload->>visitId', visitId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ReportEmailStatus | null) ?? null;
}

/**
 * One-line email delivery state for the report card, from the notification
 * row: queued/sending until the send-email cron drains it, then
 * sent / failed / skipped_no_provider (terminal). Null row = nothing queued
 * (no email on file when the visit finished).
 */
export function reportStatusLine(n: ReportEmailStatus | null, tz: string): string {
  if (!n) return 'Email: not sent — client has no email on file';
  switch (n.status) {
    case 'queued':
    case 'sending':
      return 'Email: queued';
    case 'sent':
      return n.updated_at
        ? `Email: sent ${formatInTimeZone(new Date(n.updated_at), tz, 'MMM d, h:mm a')}`
        : 'Email: sent';
    case 'failed':
      return 'Email: failed to send';
    case 'skipped_no_provider':
      return 'Email: not sent — email delivery pending setup';
    default:
      return `Email: ${n.status}`;
  }
}

/**
 * Pet names for the device-composed SMS body (owner RLS read). Sorted by name
 * to match the senders' context assembly.
 */
export async function listPetNames(petIds: string[]): Promise<string[]> {
  if (petIds.length === 0) return [];
  const { data, error } = await supabase.from('pets').select('name').in('id', petIds).order('name');
  if (error) throw error;
  return ((data ?? []) as { name: string }[]).map((p) => p.name);
}

/** Owner re-queues the report EMAIL (audited 'report.resend' in the DB). */
export async function resendReport(visitId: string): Promise<void> {
  const { error } = await supabase.rpc('resend_report', { p_visit: visitId });
  if (error) throw error;
}

/** Owner revokes the public link (audited 'report.revoke'; page then 404s). */
export async function revokeReport(visitId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_report', { p_visit: visitId });
  if (error) throw error;
}
