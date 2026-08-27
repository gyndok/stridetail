import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/src/features/auth/session';
import { useMemberships } from '@/src/features/business/useMemberships';
import { useTheme } from '@/src/ui/theme';

/**
 * Client portal group (Plan 8 Task 2). A plain Stack for now; Task 4 swaps
 * this for the portal tabs — screens stay siblings of home.tsx, nothing moves.
 * Guard: staff (any membership) never lives here — dual-role users land on
 * the staff tabs via `/`.
 */
export default function PortalLayout() {
  const t = useTheme();
  const { status } = useSession();
  const memberships = useMemberships();
  if (status === 'signed-out') return <Redirect href="/portal-login" />;
  if (status === 'loading' || !memberships.isSuccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.colors.surface }}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }
  if (memberships.data.length) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
