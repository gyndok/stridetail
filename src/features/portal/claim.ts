import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { claimClientLinks } from './api';
import { useClientLinks } from './useClientLinks';

/**
 * Run the claim RPC and, when it created links, refresh the ['client-links']
 * query so the portal flips from "no account found" to the linked view.
 * Returns the number of links created.
 */
export async function claimAndRefresh(qc: QueryClient): Promise<number> {
  const { linked } = await claimClientLinks();
  if (linked > 0) await qc.invalidateQueries({ queryKey: ['client-links'] });
  return linked;
}

/**
 * The claim-on-empty guard, pure so the hook logic is unit-testable: attempt
 * exactly once, only after the links query resolved, and only when it came
 * back empty (a linked user already ran the claim at OTP login).
 */
export function shouldAttemptClaim(
  isSuccess: boolean,
  linkCount: number,
  alreadyAttempted: boolean,
): boolean {
  return isSuccess && linkCount === 0 && !alreadyAttempted;
}

/**
 * Portal home (Plan 8 Task 3): when the links query resolves empty, try the
 * claim once — an invited-but-unlinked user gets linked right here and the
 * invalidation re-renders the linked view; anyone else keeps the friendly
 * "no account found" message (claim errors are deliberately swallowed).
 */
export function useClaimOnEmptyLinks() {
  const qc = useQueryClient();
  const links = useClientLinks();
  const attempted = useRef(false);
  const count = links.isSuccess ? links.data.length : 0;
  useEffect(() => {
    if (!shouldAttemptClaim(links.isSuccess, count, attempted.current)) return;
    attempted.current = true;
    void claimAndRefresh(qc).catch(() => {
      // Best effort — the no-account message stays and a re-login retries.
    });
  }, [links.isSuccess, count, qc]);
}
