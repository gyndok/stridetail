import '@/src/lib/gps/task';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initSession } from '@/src/features/auth/session';
import { hydrateActiveBusiness, useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { setSegmentRollListener } from '@/src/lib/gps/controller';
import { persistOptions } from '@/src/lib/offline/queryPersister';
import { hasActiveVisit, kickSync } from '@/src/lib/offline/sync';
import { ThemeProvider } from '@/src/ui/theme';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

const ACTIVE_VISIT_SYNC_INTERVAL_MS = 30_000;

function Providers({ children }: { children: React.ReactNode }) {
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const accent = memberships.data?.find((m) => m.business_id === businessId)?.business.brand_color;
  return <ThemeProvider accent={accent}>{children}</ThemeProvider>;
}

export default function RootLayout() {
  useEffect(() => {
    void hydrateActiveBusiness();
    return initSession();
  }, []);
  // TanStack Query cannot see app focus in React Native on its own; wire it to
  // AppState so queries marked stale refetch when the app returns to foreground.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => sub.remove();
  }, []);
  // Outbox sync triggers (Plan 4 Task 3): drain on launch, on foreground, after
  // every GPS segment roll, and every 30 s while a visit is locally active.
  // No netinfo dependency — a kick while offline just fails fast and backs off.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    kickSync();
    setSegmentRollListener(() => kickSync());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') kickSync();
    });
    const interval = setInterval(() => {
      void hasActiveVisit().then((active) => {
        if (active) kickSync();
      });
    }, ACTIVE_VISIT_SYNC_INTERVAL_MS);
    return () => {
      setSegmentRollListener(null);
      sub.remove();
      clearInterval(interval);
    };
  }, []);
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <Providers>
          <Stack screenOptions={{ headerShown: false }} />
        </Providers>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
