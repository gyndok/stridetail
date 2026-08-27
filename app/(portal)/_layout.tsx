import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/src/features/auth/session';
import { useMemberships } from '@/src/features/business/useMemberships';
import { hydratePortalScope } from '@/src/features/portal/scope';
import { BillingIcon, HomeIcon, PawIcon, ReportsIcon, RequestIcon } from '@/src/ui/icons';
import { useTheme } from '@/src/ui/theme';

/**
 * Client portal shell (Plan 8 Task 4): the Task-2 Stack swapped for Tabs —
 * Home, Reports, Invoices, Pets, Requests; screens stay siblings of home.tsx.
 * Guard unchanged: signed-out → portal login; staff (any membership) never
 * lives here — dual-role users land on the staff tabs via `/`.
 * Tenant branding renders inside each screen (PortalScreen band), so the
 * navigator headers stay off.
 */
export default function PortalLayout() {
  const t = useTheme();
  const { status } = useSession();
  const memberships = useMemberships();
  useEffect(() => {
    void hydratePortalScope();
  }, []);
  if (status === 'signed-out') return <Redirect href="/portal-login" />;
  if (status === 'loading' || !memberships.isSuccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.colors.surface }}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }
  if (memberships.data.length) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.inkMuted,
        tabBarStyle: { backgroundColor: t.colors.surfaceRaised, borderTopColor: t.colors.line },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => <ReportsIcon color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: 'Invoices',
          tabBarIcon: ({ color, size }) => <BillingIcon color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="pets"
        options={{
          title: 'Pets',
          tabBarIcon: ({ color, size }) => <PawIcon color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
          tabBarIcon: ({ color, size }) => <RequestIcon color={color} size={size ?? 22} />,
        }}
      />
      {/* Task 6 pet editor: a detail route, not a tab. */}
      <Tabs.Screen name="pet/[id]" options={{ href: null }} />
    </Tabs>
  );
}
