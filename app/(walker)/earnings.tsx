import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatCents } from '@/src/features/billing/money';
import {
  listMyPayoutStatements,
  payoutStatusChip,
  periodLabel,
} from '@/src/features/billing/payouts';
import { StatusBadge } from '@/src/features/billing/StatusBadge';
import { useActiveBusiness } from '@/src/features/business/active';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';
import { errorText } from '@/src/lib/errorText';

/**
 * Walker earnings (Plan 6 Task 2): the caller's own finalized/paid payout
 * statements, read-only, items inline-expanded on tap. RLS hides drafts and
 * other walkers' statements; a hidden tab screen (href: null) reached from the
 * shared Settings screen — owners land here too and see their own walking
 * earnings, if any.
 */

export default function EarningsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();
  const [openId, setOpenId] = useState<string | null>(null);

  const statements = useQuery({
    queryKey: ['myPayouts', businessId],
    enabled: !!businessId,
    queryFn: () => listMyPayoutStatements(businessId!),
  });
  useRefetchOnFocus(statements.refetch);

  const rowBetween = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: t.space.sm,
  };

  return (
    <Screen title="Earnings">
      <Button title="Back" variant="ghost" onPress={() => router.back()} />
      {statements.error ? (
        <Text style={{ color: t.colors.danger }}>{errorText(statements.error)}</Text>
      ) : null}

      {(statements.data ?? []).map((st) => {
        const chip = payoutStatusChip(st.status);
        const open = openId === st.id;
        return (
          <Pressable key={st.id} onPress={() => setOpenId(open ? null : st.id)}>
            <Card style={{ gap: t.space.sm }}>
              <View style={rowBetween}>
                <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
                  {periodLabel(st.period_start, st.period_end)}
                </Text>
                <StatusBadge label={chip.label} tone={chip.tone} />
              </View>
              <View style={rowBetween}>
                <Text style={{ color: t.colors.inkMuted }}>
                  {st.items.length} item{st.items.length === 1 ? '' : 's'}
                </Text>
                <Text style={{ color: t.colors.ink, fontWeight: '700', textAlign: 'right' }}>
                  {formatCents(st.total_cents)}
                </Text>
              </View>
              {open
                ? st.items.map((item) => (
                    <View key={item.id} style={rowBetween}>
                      <Text style={{ color: t.colors.inkMuted, flex: 1 }}>{item.description}</Text>
                      <Text style={{ color: t.colors.inkMuted }}>
                        {formatCents(item.amount_cents)}
                      </Text>
                    </View>
                  ))
                : null}
            </Card>
          </Pressable>
        );
      })}
      {statements.isSuccess && (statements.data ?? []).length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>
          No finalized statements yet. They appear here once the owner finalizes a payout.
        </Text>
      ) : null}
    </Screen>
  );
}
