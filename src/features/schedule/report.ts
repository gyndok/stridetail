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

export const REPORT_COLUMNS = 'public_token, sent_at, sms_status, revoked_at';

export type VisitReport = {
  public_token: string;
  sent_at: string | null;
  sms_status: string | null;
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

/** The exact link the client received by SMS (send-sms builds it the same way). */
export function reportLink(token: string): string {
  return `${REPORT_BASE_URL.replace(/\/$/, '')}/${token}`;
}

/**
 * One-line SMS delivery state for the report card. sms_status is stamped by
 * the send-sms sender: null until the queue drains, then
 * sent / failed / skipped_no_provider (terminal).
 */
export function reportStatusLine(
  r: Pick<VisitReport, 'sent_at' | 'sms_status'>,
  tz: string,
): string {
  switch (r.sms_status) {
    case null:
      return 'SMS: queued';
    case 'sent':
      return r.sent_at
        ? `SMS: sent ${formatInTimeZone(new Date(r.sent_at), tz, 'MMM d, h:mm a')}`
        : 'SMS: sent';
    case 'failed':
      return 'SMS: failed to send';
    case 'skipped_no_provider':
      return 'SMS: not sent — SMS pending setup';
    default:
      return `SMS: ${r.sms_status}`;
  }
}

/** Owner re-queues the report SMS (audited 'report.resend' in the DB). */
export async function resendReport(visitId: string): Promise<void> {
  const { error } = await supabase.rpc('resend_report', { p_visit: visitId });
  if (error) throw error;
}

/** Owner revokes the public link (audited 'report.revoke'; page then 404s). */
export async function revokeReport(visitId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_report', { p_visit: visitId });
  if (error) throw error;
}
