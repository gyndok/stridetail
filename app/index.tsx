import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { getPortalEntry } from '@/src/features/auth/portalEntry';
import { useSession } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import { getPendingInvite } from '@/src/features/business/pendingInvite';
import { useMemberships } from '@/src/features/business/useMemberships';
import { resolveEntry } from '@/src/features/portal/resolveEntry';
import { useClientLinks } from '@/src/features/portal/useClientLinks';
import { useTheme } from '@/src/ui/theme';

export default function Index() {
  const t = useTheme();
  const { status } = useSession();
  const { businessId, hydrated, setBusinessId } = useActiveBusiness();
  const memberships = useMemberships();
  const clientLinks = useClientLinks();
  const ready =
    status !== 'loading' &&
    hydrated &&
    (status === 'signed-out' || (memberships.isSuccess && clientLinks.isSuccess));
  // undefined = not yet read; null = none pending
  const [pendingInvite, setPendingInvite] = useState<string | null | undefined>(undefined);
  // undefined = not yet read (Plan 8 Task 2: which door the user signed in through)
  const [viaPortal, setViaPortal] = useState<boolean | undefined>(undefined);
  const entry =
    memberships.data && clientLinks.data && viaPortal !== undefined
      ? resolveEntry(memberships.data, clientLinks.data, businessId, viaPortal)
      : null;
  const entryBusinessId = entry?.businessId ?? null;

  useEffect(() => {
    let cancelled = false;
    void getPendingInvite()
      .catch(() => null)
      .then((tok) => {
        if (!cancelled) setPendingInvite(tok ?? null);
      });
    void getPortalEntry()
      .catch(() => false)
      .then((via) => {
        if (!cancelled) setViaPortal(via ?? false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (entryBusinessId && entryBusinessId !== businessId) void setBusinessId(entryBusinessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryBusinessId]);

  if (!ready || pendingInvite === undefined || (status === 'signed-in' && !entry)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.colors.surface }}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }
  if (status === 'signed-out' || !entry) return <Redirect href="/sign-in" />;
  // A user who had to sign up first returns to the invite they opened.
  if (pendingInvite) return <Redirect href={`/invite/${pendingInvite}`} />;
  return <Redirect href={entry.href} />;
}
