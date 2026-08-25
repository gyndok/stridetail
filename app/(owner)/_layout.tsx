import { Redirect, Tabs } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';

import { useSession } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { DESKTOP_MIN_WIDTH, OwnerRail } from '@/src/ui/web/OwnerRail';
import { useTheme } from '@/src/ui/theme';

export default function OwnerTabs() {
  const t = useTheme();
  const { status } = useSession();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const { width } = useWindowDimensions();
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
                items={state.routes.map((route, index) => ({
                  key: route.key,
                  label: descriptors[route.key]?.options.title ?? route.name,
                  active: index === state.index,
                  onPress: () => {
                    const event = navigation.emit({
                      type: 'tabPress',
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (index !== state.index && !event.defaultPrevented) {
                      navigation.navigate(route.name, route.params);
                    }
                  },
                }))}
              />
            ),
          }
        : null)}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule' }} />
      <Tabs.Screen name="clients" options={{ title: 'Clients' }} />
      <Tabs.Screen name="team" options={{ title: 'Team' }} />
      <Tabs.Screen name="billing" options={{ title: 'Billing' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
