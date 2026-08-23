import '@/src/lib/gps/task';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
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
