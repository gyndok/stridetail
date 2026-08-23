import { useQueryClient } from '@tanstack/react-query';
import { Text } from 'react-native';

import { signOut } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function Settings() {
  const t = useTheme();
  const qc = useQueryClient();
  const { businessId, setBusinessId } = useActiveBusiness();
  const { data } = useMemberships();
  const current = data?.find((m) => m.business_id === businessId)?.business;
  return (
    <Screen title="Settings">
      <Card>
        <Text style={[t.type.title, { color: t.colors.ink }]}>{current?.name ?? '—'}</Text>
        <Text style={{ color: t.colors.inkMuted }}>{current?.time_zone}</Text>
      </Card>
      {data && data.length > 1
        ? data.map((m) => (
            <Button
              key={m.id}
              title={`Switch to ${m.business.name}`}
              variant="secondary"
              onPress={() => void setBusinessId(m.business_id)}
            />
          ))
        : null}
      <Button
        title="Sign out"
        variant="ghost"
        onPress={() =>
          void signOut().then(() => {
            void setBusinessId(null);
            qc.clear();
          })
        }
      />
    </Screen>
  );
}
