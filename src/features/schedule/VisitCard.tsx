import { PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';

import { visitDayLabel, visitTimeRange, type Visit } from '@/src/features/schedule/api';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

type Props = PropsWithChildren<{
  visit: Visit;
  /** Optional "Walker: ..." line (owner screens). */
  walkerLine?: string;
  /** Optional status text, rendered muted after the service line. */
  statusLabel?: string;
  /** Show the local day above the time range (for lists spanning dates). */
  showDay?: boolean;
  onPress?: () => void;
}>;

/**
 * Shared visit card: local time range in the visit's business tz, client name,
 * service name/duration. Deliberately plain composition (Round 0 pending).
 * Children render below the facts — action rows, decline forms, etc.
 */
export function VisitCard({ visit, walkerLine, statusLabel, showDay, onPress, children }: Props) {
  const t = useTheme();
  const body = (
    <Card style={{ gap: t.space.xs }}>
      {showDay ? (
        <Text style={{ color: t.colors.inkMuted, fontSize: 12, fontWeight: '700' }}>
          {visitDayLabel(visit)}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
          {visit.client?.name ?? 'Client'}
        </Text>
        <Text style={{ color: t.colors.ink, fontWeight: '600' }}>{visitTimeRange(visit)}</Text>
      </View>
      <Text style={{ color: t.colors.inkMuted }}>
        {visit.service?.name ?? 'Service'}
        {visit.service ? ` · ${visit.service.duration_min} min` : ''}
        {statusLabel ? ` · ${statusLabel}` : ''}
      </Text>
      {walkerLine ? <Text style={{ color: t.colors.inkMuted }}>{walkerLine}</Text> : null}
      {children}
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}
