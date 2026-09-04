import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/src/features/auth/session';
import { registerForPush } from '@/src/features/notifications/push';
import { ClientsIcon, ScheduleIcon, SettingsIcon, TodayIcon } from '@/src/ui/icons';
import { useTheme } from '@/src/ui/theme';

export default function WalkerTabs() {
  const t = useTheme();
  const { status } = useSession();
  // Round 4: staff push registration (visit offers are the walker's whole ask).
  useEffect(() => {
    if (status === 'signed-in') void registerForPush();
  }, [status]);
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
      {/* Icons take the navigator's tint through the passed `color` prop —
          the theme default inside each icon never overrides it. */}
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <TodayIcon color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }) => <ScheduleIcon color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, size }) => <ClientsIcon color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size ?? 22} />,
        }}
      />
      {/* Visit detail + active screens live inside the tab navigator but are
          kept out of the bar with href: null (expo-router hidden tab screens);
          the tabs stay usable while a visit is open. */}
      <Tabs.Screen name="visit/[id]/index" options={{ href: null }} />
      <Tabs.Screen name="visit/[id]/active" options={{ href: null }} />
      {/* Earnings is reached from Settings (both role groups), not the bar. */}
      <Tabs.Screen name="earnings" options={{ href: null }} />
      {/* User's manual — same shared screen as the owner group's; reached from
          the Settings row, never a tab here. */}
      <Tabs.Screen name="manual" options={{ href: null }} />
    </Tabs>
  );
}
