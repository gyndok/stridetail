import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import { resolveHome } from '@/src/features/business/resolveHome';
import { useMemberships } from '@/src/features/business/useMemberships';
import { useTheme } from '@/src/ui/theme';

export default function Index() {
  const t = useTheme();
  const { status } = useSession();
  const { businessId, hydrated, setBusinessId } = useActiveBusiness();
  const memberships = useMemberships();
  const ready = status !== 'loading' && hydrated && (status === 'signed-out' || memberships.isSuccess);
  const home = memberships.data ? resolveHome(memberships.data, businessId) : null;
  const homeBusinessId = home?.businessId ?? null;

  useEffect(() => {
    if (homeBusinessId && homeBusinessId !== businessId) void setBusinessId(homeBusinessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeBusinessId]);

  if (!ready || (status === 'signed-in' && !home)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.colors.surface }}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }
  if (status === 'signed-out' || !home) return <Redirect href="/sign-in" />;
  return <Redirect href={home.href} />;
}
