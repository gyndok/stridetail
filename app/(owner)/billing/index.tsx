import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { listHeldDeposits, listInvoices, type InvoiceListItem } from '@/src/features/billing/api';
import {
  formatCents,
  formatIsoDate,
  invoiceBalance,
  invoiceNumberLabel,
  overdueCount,
  statusChip,
  sumCents,
  unpaidTotalCents,
  type ChipTone,
} from '@/src/features/billing/money';
import { Chip } from '@/src/features/schedule/Chip';
import { useActiveBusiness } from '@/src/features/business/active';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme, type Theme } from '@/src/ui/theme';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'draft', label: 'Draft' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

// Filter semantics match the summary strip: Unpaid = sent (billed, money
// still owed some or all); Draft = not yet billed.
function applyFilter(invoices: InvoiceListItem[], filter: FilterKey): InvoiceListItem[] {
  if (filter === 'unpaid') return invoices.filter((inv) => inv.status === 'sent');
  if (filter === 'draft') return invoices.filter((inv) => inv.status === 'draft');
  return invoices;
}

// statusChip tone -> token color (greens for paid, per Round 0).
function toneColor(tone: ChipTone, t: Theme): string {
  if (tone === 'green') return t.colors.green;
  if (tone === 'danger') return t.colors.danger;
  if (tone === 'warning') return t.colors.warning;
  if (tone === 'muted') return t.colors.inkMuted;
  return t.colors.ink;
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: t.space.xs }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{label}</Text>
      <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

export default function BillingIndex() {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();
  const [filter, setFilter] = useState<FilterKey>('all');

  const invoices = useQuery({
    queryKey: ['invoices', businessId],
    enabled: !!businessId,
    queryFn: () => listInvoices(businessId!),
  });
  const deposits = useQuery({
    queryKey: ['deposits', businessId, 'held'],
    enabled: !!businessId,
    queryFn: () => listHeldDeposits(businessId!),
  });
  useRefetchOnFocus(invoices.refetch);
  useRefetchOnFocus(deposits.refetch);

  const now = new Date();
  const all = invoices.data ?? [];
  const filtered = applyFilter(all, filter);
  const unpaidCents = unpaidTotalCents(all);
  const overdue = overdueCount(all, now);
  const heldCents = sumCents(deposits.data ?? []);

  return (
    <Screen title="Billing">
      <Button title="New invoice" onPress={() => router.push('/billing/new' as Href)} />
      <Card style={{ flexDirection: 'row', gap: t.space.md }}>
        <SummaryStat label="Unpaid" value={formatCents(unpaidCents)} />
        <SummaryStat label="Overdue" value={String(overdue)} />
        <SummaryStat label="Held deposits" value={formatCents(heldCents)} />
      </Card>
      <Pressable onPress={() => router.push('/billing/deposits' as Href)}>
        <Card
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>Deposits</Text>
          <Text style={{ color: t.colors.inkMuted }}>View ledger →</Text>
        </Card>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>
      {invoices.error ? (
        <Text style={{ color: t.colors.danger }}>
          {invoices.error instanceof Error ? invoices.error.message : String(invoices.error)}
        </Text>
      ) : null}
      {filtered.map((inv) => {
        const balance = invoiceBalance(inv.items, inv.payments);
        const chip = statusChip(
          inv,
          { itemsCents: sumCents(inv.items), paymentsCents: sumCents(inv.payments) },
          now,
        );
        const color = toneColor(chip.tone, t);
        return (
          // Route exists in Task 4; `as Href` until .expo/types regenerate (house precedent).
          <Pressable key={inv.id} onPress={() => router.push(`/billing/${inv.id}` as Href)}>
            <Card style={{ gap: t.space.xs }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.sm }}
              >
                <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
                  {invoiceNumberLabel(inv.number)} · {inv.client?.name ?? 'Client'}
                </Text>
                <View
                  style={{ borderWidth: 1, borderColor: color, borderRadius: t.radius.pill,
                    paddingHorizontal: t.space.sm, paddingVertical: t.space.xs / 2 }}
                >
                  <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{chip.label}</Text>
                </View>
              </View>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.sm }}
              >
                <Text style={{ color: t.colors.inkMuted }}>Issued {formatIsoDate(inv.issued_on)}</Text>
                <Text style={{ color: t.colors.ink, fontWeight: '700', textAlign: 'right' }}>
                  {formatCents(balance)}
                </Text>
              </View>
            </Card>
          </Pressable>
        );
      })}
      {invoices.isSuccess && filtered.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>
          {filter === 'all'
            ? 'No invoices yet. Create one from a client’s completed visits.'
            : 'No invoices match this filter.'}
        </Text>
      ) : null}
    </Screen>
  );
}
