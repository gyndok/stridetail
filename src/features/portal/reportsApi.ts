import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';

import { supabase } from '@/src/lib/supabase';

import type { PortalVisitStatus } from './home';

/**
 * Portal reports archive (Plan 8 Task 5). Own file so Task 5 never collides
 * with the Task 4 dashboard queries in api.ts/hooks.ts. Same house rules:
 * named columns ONLY, never price_cents_snapshot / owner_notes_md /
 * decline_reason / private_notes_md (portalReportsApi.test.ts pins it).
 *
 * Detail rendering: visit_reports.public_token is client-readable (whole-table
 * select grant + the Task 1 row policy), so a row deep-links to the existing
 * public report page at /report/<token> — map image, timeline, photos, all
 * already built. The token is fetched through the client's OWN RLS read; the
 * public page is just the renderer (recorded in DEVIATIONS.md).
 */

export const PORTAL_REPORT_ARCHIVE_COLUMNS =
  'id, visit_id, created_at, public_token, revoked_at, ' +
  'visit:visits!inner(id, client_id, scheduled_start, business_tz, status, pet_ids, ' +
  'service:services(name))';

export type PortalReportCard = {
  id: string;
  visit_id: string;
  created_at: string;
  public_token: string;
  /** Owner revoked the link — the row stays, the deep link does not. */
  revoked_at: string | null;
  visit: {
    id: string;
    client_id: string;
    scheduled_start: string;
    business_tz: string;
    status: PortalVisitStatus;
    pet_ids: string[];
    service: { name: string } | null;
  };
};

/** Every report card of the client, newest first (v1 cap: 200 rows). */
export async function listReportArchive(clientId: string, limit = 200): Promise<PortalReportCard[]> {
  const { data, error } = await supabase
    .from('visit_reports')
    .select(PORTAL_REPORT_ARCHIVE_COLUMNS)
    .eq('visit.client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PortalReportCard[];
}

export function useReportArchive(clientId: string | null, limit = 200) {
  return useQuery({
    queryKey: ['portal-report-archive', clientId, limit],
    queryFn: () => listReportArchive(clientId as string, limit),
    enabled: Boolean(clientId),
  });
}

/**
 * Where a report row navigates: the public report page for its own token —
 * null when the owner revoked the link (the row still renders, marked
 * unavailable, rather than dead-linking into the page's 404 state).
 */
export function reportHref(r: Pick<PortalReportCard, 'public_token' | 'revoked_at'>): string | null {
  return r.revoked_at ? null : `/report/${r.public_token}`;
}

export type ReportMonthGroup = {
  /** 'yyyy-MM' in the visit's business zone — stable list key. */
  key: string;
  /** 'August 2026'. */
  label: string;
  reports: PortalReportCard[];
};

/**
 * Month-grouped archive, newest month first, newest visit first within each
 * month. Grouped by the VISIT's scheduled_start in the visit's own business
 * zone (the archive is about when the walk happened, not when the report row
 * was written). Pure — sorts its own copy, ignores incoming order.
 */
export function groupReportsByMonth(reports: PortalReportCard[]): ReportMonthGroup[] {
  const sorted = [...reports].sort((a, b) =>
    Date.parse(b.visit.scheduled_start) - Date.parse(a.visit.scheduled_start),
  );
  const byKey = new Map<string, ReportMonthGroup>();
  const groups: ReportMonthGroup[] = [];
  for (const r of sorted) {
    const when = new Date(r.visit.scheduled_start);
    const key = formatInTimeZone(when, r.visit.business_tz, 'yyyy-MM');
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: formatInTimeZone(when, r.visit.business_tz, 'MMMM yyyy'), reports: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.reports.push(r);
  }
  return groups;
}
