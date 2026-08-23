import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { useSession } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import { clearPendingInvite, setPendingInvite } from '@/src/features/business/pendingInvite';
import { supabase } from '@/src/lib/supabase';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function AcceptInvite() {
  const t = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { status } = useSession();
  const { setBusinessId } = useActiveBusiness();
  const qc = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) void setPendingInvite(token);
  }, [token]);

  if (status === 'loading') return null;
  if (status === 'signed-out') return <Redirect href="/sign-up" />;

  async function accept() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke<{ businessId: string }>('invite-accept', {
      body: { token },
    });
    setBusy(false);
    if (error || !data?.businessId) {
      setError(error?.message ?? 'Could not accept invite');
      return;
    }
    await clearPendingInvite();
    await setBusinessId(data.businessId);
    await qc.invalidateQueries({ queryKey: ['memberships'] });
    router.replace('/');
  }

  return (
    <Screen title="You're invited">
      <Text style={{ color: t.colors.inkMuted }}>Join this team to see your visits and schedule.</Text>
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      <Button title="Accept invite" onPress={() => void accept()} loading={busy} />
    </Screen>
  );
}
