import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { formatCents } from '@/src/features/billing/money';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

import { revenueDeltaLabel, type DeltaTone } from './kpiMath';
import type { DashboardKpis } from './kpis';

// Plan 8b Task 1 — the four KPI cards. Every card is a tap-through into the
// full screen it summarizes (plan: panels deep-link, never reimplement).

type KpiCard = {
  key: string;
  label: string;
  value: string;
  sub: string;
  subTone: DeltaTone;
  href: Href;
};

/** Pure card model so the render below is a dumb map (and tests read easily). */
export function kpiCards(kpis: DashboardKpis): KpiCard[] {
  const delta = revenueDeltaLabel(kpis.revenue.deltaCents);
  const { clients, pets } = kpis.clients;
  const { completed, total } = kpis.walks;
  const { totalCents, unpaidCount } = kpis.outstanding;
  return [
    {
      key: 'revenue',
      label: 'Revenue this week',
      value: formatCents(kpis.revenue.currentCents),
      sub: delta.text,
      subTone: delta.tone,
      href: '/billing' as Href,
    },
    {
      key: 'clients',
      label: 'Active clients',
      value: String(clients),
      sub: `${pets} pet${pets === 1 ? '' : 's'}`,
      subTone: 'muted',
      href: '/clients' as Href,
    },
    {
      key: 'walks',
      label: 'Walks this week',
      value: `${completed}/${total}`,
      sub: 'completed',
      subTone: 'muted',
      href: '/schedule' as Href,
    },
    {
      key: 'outstanding',
      label: 'Outstanding',
      value: formatCents(totalCents),
      sub: `${unpaidCount} unpaid invoice${unpaidCount === 1 ? '' : 's'}`,
      subTone: unpaidCount > 0 ? 'warning' : 'muted',
      href: '/billing' as Href,
    },
  ];
}

export function KpiRow({ kpis }: { kpis: DashboardKpis | undefined }) {
  const t = useTheme();
  const router = useRouter();
  const tone: Record<DeltaTone, string> = {
    green: t.colors.green,
    warning: t.colors.warning,
    muted: t.colors.inkMuted,
  };
  return (
    <View style={{ flexDirection: 'row', gap: t.space.md }}>
      {kpis
        ? kpiCards(kpis).map((card) => (
            <Pressable
              key={card.key}
              accessibilityRole="button"
              accessibilityLabel={card.label}
              onPress={() => router.push(card.href)}
              style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}
            >
              <Card style={{ gap: t.space.xs }}>
                <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{card.label}</Text>
                <Text style={[t.type.title, { color: t.colors.ink }]}>{card.value}</Text>
                <Text style={{ color: tone[card.subTone], fontSize: 12, fontWeight: '700' }}>
                  {card.sub}
                </Text>
              </Card>
            </Pressable>
          ))
        : // Loading/error: keep the row's height stable with four quiet shells.
          ['revenue', 'clients', 'walks', 'outstanding'].map((key) => (
            <Card key={key} style={{ flex: 1, gap: t.space.xs }}>
              <Text style={[t.type.label, { color: t.colors.inkMuted }]}> </Text>
              <Text style={[t.type.title, { color: t.colors.inkMuted }]}>—</Text>
              <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}> </Text>
            </Card>
          ))}
    </View>
  );
}
