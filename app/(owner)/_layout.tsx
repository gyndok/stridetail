import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { useSession } from '@/src/features/auth/session';
import { registerForPush } from '@/src/features/notifications/push';
import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import {
  BillingIcon,
  ClientsIcon,
  ManualIcon,
  ScheduleIcon,
  SettingsIcon,
  TeamIcon,
  TodayIcon,
} from '@/src/ui/icons';
import { DESKTOP_MIN_WIDTH, OwnerRail } from '@/src/ui/web/OwnerRail';
import { useTheme } from '@/src/ui/theme';

export default function OwnerTabs() {
  const t = useTheme();
  const { status } = useSession();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const { width } = useWindowDimensions();
  // Round 4: register this signed-in device for staff push (offer/decline/
  // request alerts). No-op on binaries without the module or when denied.
  useEffect(() => {
    if (status === 'signed-in') void registerForPush();
  }, [status]);
  if (status === 'signed-out') return <Redirect href="/sign-in" />;
  // Role guard: deep links can land anyone in this group; RLS keeps the data
  // safe, but a walker must never see the owner shell. Wait for the roster
  // before deciding so a slow load doesn't bounce the actual owner.
  if (memberships.data && businessId) {
    const role = memberships.data.find((m) => m.business_id === businessId)?.role;
    if (role !== 'owner') return <Redirect href="/" />;
  }
  // Desktop web (Plan 4 Task 8): same Tabs navigator — same routes, same tab
  // state — but the bar docks left (`tabBarPosition: 'left'`, supported by the
  // SDK 57 vendored bottom-tabs; verified in its typings) and renders as our
  // rail via the custom `tabBar`. Below 900 px and on native nothing changes.
  const desktop = Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
  const businessName =
    memberships.data?.find((m) => m.business_id === businessId)?.business.name ?? 'Stridetail';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.inkMuted,
        tabBarStyle: { backgroundColor: t.colors.surfaceRaised, borderTopColor: t.colors.line },
        ...(desktop ? { tabBarPosition: 'left' as const } : null),
      }}
      {...(desktop
        ? {
            tabBar: ({ state, descriptors, navigation }) => (
              <OwnerRail
                businessName={businessName}
                items={state.routes
                  // Hidden (href: null) routes stay out of the rail too — the
                  // custom tabBar sees the raw route state. Active state keys
                  // off the route, not the (now filtered) array index.
                  .filter((route) => route.name !== 'requests')
                  .map((route) => ({
                    key: route.key,
                    label: descriptors[route.key]?.options.title ?? route.name,
                    active: route.key === state.routes[state.index]?.key,
                    onPress: () => {
                      const event = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                      });
                      if (route.key !== state.routes[state.index]?.key && !event.defaultPrevented) {
                        navigation.navigate(route.name, route.params);
                      }
                    },
                  }))}
              />
            ),
          }
        : null)}
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
        name="team"
        options={{
          title: 'Team',
          tabBarIcon: ({ color, size }) => <TeamIcon color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="billing"
        options={{
          title: 'Billing',
          tabBarIcon: ({ color, size }) => <BillingIcon color={color} size={size ?? 22} />,
        }}
      />
      {/* User's manual: a rail entry above Settings on web (the rail maps this
          registration order). On NATIVE the phone keeps its six tabs — href:
          null hides the route from the bottom bar there, and phones reach the
          manual via the Settings row instead (SettingsScreen). */}
      <Tabs.Screen
        name="manual"
        options={{
          href: Platform.OS === 'web' ? undefined : null,
          title: "User's manual",
          tabBarIcon: ({ color, size }) => <ManualIcon color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size ?? 22} />,
        }}
      />
      {/* Plan 8 Task 7: booking requests — reached from Today/Schedule, not a tab. */}
      <Tabs.Screen name="requests" options={{ href: null }} />
    </Tabs>
  );
}
