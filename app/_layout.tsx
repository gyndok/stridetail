import '@/src/lib/gps/task';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initSession } from '@/src/features/auth/session';
import { hydrateActiveBusiness, useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { ThemeProvider } from '@/src/ui/theme';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

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
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Providers>
          <Stack screenOptions={{ headerShown: false }} />
        </Providers>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
