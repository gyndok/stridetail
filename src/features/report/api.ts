import { env } from '@/src/lib/env';

/**
 * Public report fetch (Plan 4 Task 7). Deliberately a PLAIN fetch, not the
 * supabase client: the /report/[token] page is direct-linked and must work
 * with no session at all (report-public has verify_jwt off — the token is the
 * credential). The anon apikey header is sent for the gateway's benefit only.
 */

export type ReportPayload = {
  business: { name: string; brandColor: string; logoUrl: string | null };
  businessTz: string;
  summary: {
    petNames: string[];
    serviceName: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    durationMin: number | null;
    distanceM: number | null;
  };
  timeline: { type: string; occurredAt: string; text: string | null; photoUrl: string | null }[];
  route: { lat: number; lng: number }[];
};

/** Unknown or revoked token — the page shows the friendly gone state. */
export class ReportUnavailableError extends Error {
  constructor() {
    super('This report is no longer available.');
    this.name = 'ReportUnavailableError';
  }
}

export function reportEndpoint(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/report-public`;
}

export async function fetchPublicReport(token: string): Promise<ReportPayload> {
  const res = await fetch(reportEndpoint(env.SUPABASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
    body: JSON.stringify({ token }),
  });
  if (res.status === 404) throw new ReportUnavailableError();
  if (!res.ok) throw new Error(`Could not load the report (${res.status}). Please try again.`);
  return (await res.json()) as ReportPayload;
}
