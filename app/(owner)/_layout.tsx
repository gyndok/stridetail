import { Redirect, Tabs } from 'expo-router';

import { useSession } from '@/src/features/auth/session';
import { useTheme } from '@/src/ui/theme';

export default function OwnerTabs() {
  const t = useTheme();
  const { status } = useSession();
  if (status === 'signed-out') return <Redirect href="/sign-in" />;
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
