import { Redirect, Tabs } from 'expo-router';

import { useSession } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { useTheme } from '@/src/ui/theme';

export default function OwnerTabs() {
  const t = useTheme();
  const { status } = useSession();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  if (status === 'signed-out') return <Redirect href="/sign-in" />;
  // Role guard: deep links can land anyone in this group; RLS keeps the data
  // safe, but a walker must never see the owner shell. Wait for the roster
  // before deciding so a slow load doesn't bounce the actual owner.
  if (memberships.data && businessId) {
    const role = memberships.data.find((m) => m.business_id === businessId)?.role;
    if (role !== 'owner') return <Redirect href="/" />;
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.inkMuted,
        tabBarStyle: { backgroundColor: t.colors.surfaceRaised, borderTopColor: t.colors.line },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule' }} />
      <Tabs.Screen name="clients" options={{ title: 'Clients' }} />
      <Tabs.Screen name="team" options={{ title: 'Team' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
