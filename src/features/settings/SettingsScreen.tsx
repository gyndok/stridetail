import { useQueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { signOut } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { useWalkTheme, type WalkTheme } from '@/src/features/settings/walkTheme';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

const WALK_THEMES: { key: WalkTheme; label: string }[] = [
  { key: 'warm', label: 'Warm' },
  { key: 'dark', label: 'Dark' },
];

/**
 * Shared by the owner and walker settings tabs. `extra` renders role-specific
 * rows (e.g. the owner's Services link) above the sign-out button; the walker
 * route passes nothing.
 */
export function SettingsScreen({ extra }: { extra?: ReactNode }) {
  const t = useTheme();
  const qc = useQueryClient();
  const { businessId, setBusinessId } = useActiveBusiness();
  const { data } = useMemberships();
  const current = data?.find((m) => m.business_id === businessId)?.business;
  const { walkTheme, setWalkTheme } = useWalkTheme();
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
      {/* Walk screen appearance (Round 0): shared by both roles — walkers are
          the ones who use it, but an owner walks their own visits too. */}
      <Card style={{ gap: t.space.sm }}>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Walk screen</Text>
        <View style={{ flexDirection: 'row', gap: t.space.sm }}>
          {WALK_THEMES.map((m) => (
            <View key={m.key} style={{ flex: 1 }}>
              <Button
                title={m.label}
                variant={walkTheme === m.key ? 'primary' : 'secondary'}
                onPress={() => void setWalkTheme(m.key)}
              />
            </View>
          ))}
        </View>
      </Card>
      {extra}
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
