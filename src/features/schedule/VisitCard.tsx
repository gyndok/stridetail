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

/** Statuses that earn the green accent (Round 0): the visit is covered or done. */
const POSITIVE_STATUSES = new Set(['accepted', 'completed']);

/**
 * Shared visit card: local time range in the visit's business tz, client name,
 * service name/duration. Deliberately plain composition; the only color is the
 * green badge on an accepted/completed status (Round 0).
 * Children render below the facts — action rows, decline forms, etc.
 */
export function VisitCard({ visit, walkerLine, statusLabel, showDay, onPress, children }: Props) {
  const t = useTheme();
  const positive = statusLabel != null && POSITIVE_STATUSES.has(visit.status);
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
        {statusLabel && !positive ? ` · ${statusLabel}` : ''}
      </Text>
      {positive ? (
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: t.colors.greenSoft,
            borderRadius: t.radius.pill,
            paddingHorizontal: t.space.sm,
            paddingVertical: t.space.xs / 2,
          }}
        >
          <Text style={{ color: t.colors.green, fontSize: 12, fontWeight: '700' }}>{statusLabel}</Text>
        </View>
      ) : null}
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
