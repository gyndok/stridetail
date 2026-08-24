import { Redirect, Tabs } from 'expo-router';

import { useSession } from '@/src/features/auth/session';
import { useTheme } from '@/src/ui/theme';

export default function WalkerTabs() {
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
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      {/* Visit detail + active screens live inside the tab navigator but are
          kept out of the bar with href: null (expo-router hidden tab screens);
          the tabs stay usable while a visit is open. */}
      <Tabs.Screen name="visit/[id]/index" options={{ href: null }} />
      <Tabs.Screen name="visit/[id]/active" options={{ href: null }} />
    </Tabs>
  );
}
