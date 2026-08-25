import { Redirect, Tabs, useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { useTheme } from '@/src/ui/theme';

export default function WalkerTabs() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useSession();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  if (status === 'signed-out') return <Redirect href="/sign-in" />;
  // Mode banner for owners only: an owner who tapped "My visits" is in a second
  // mode and the two shells look alike (first user confused them within a
  // minute). Contractors have exactly one mode — no banner noise for them.
  const isOwner =
    memberships.data?.find((m) => m.business_id === businessId)?.role === 'owner';
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
      {isOwner ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Walker view — back to owner view"
          onPress={() => router.push('/(owner)/today' as Href)}
          style={{
            paddingTop: insets.top,
            backgroundColor: t.colors.ink,
            paddingBottom: t.space.xs,
            paddingHorizontal: t.space.lg,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: t.colors.surface, fontWeight: '800', fontSize: 12 }}>
            🚶 WALKER VIEW
          </Text>
          <Text style={{ color: t.colors.primary, fontWeight: '800', fontSize: 12 }}>
            Owner view ↩
          </Text>
        </Pressable>
      ) : null}
      {/* The banner consumed the top inset — zero it for the subtree so the
          Screen components below don't pad for the notch a second time. */}
      <SafeAreaInsetsContext.Provider value={isOwner ? { ...insets, top: 0 } : insets}>
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
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
