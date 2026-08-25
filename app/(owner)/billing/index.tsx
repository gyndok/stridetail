import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { listHeldDeposits, listInvoices, type InvoiceListItem } from '@/src/features/billing/api';
import {
  AUTO_INVOICE_MODES,
  getBusinessBilling,
  normalizeVenmoHandle,
  updateBusinessBilling,
  type AutoInvoiceMode,
} from '@/src/features/billing/settings';
import {
  formatCents,
  formatIsoDate,
  invoiceBalance,
  invoiceNumberLabel,
  overdueCount,
  statusChip,
  sumCents,
  unpaidTotalCents,
} from '@/src/features/billing/money';
import { StatusBadge } from '@/src/features/billing/StatusBadge';
import { Chip } from '@/src/features/schedule/Chip';
import { useActiveBusiness } from '@/src/features/business/active';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

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
      <Pressable onPress={() => router.push('/billing/payouts' as Href)}>
        <Card
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>Payouts</Text>
          <Text style={{ color: t.colors.inkMuted }}>Walker statements →</Text>
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
                <StatusBadge label={chip.label} tone={chip.tone} />
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
      {businessId ? <BillingSettingsCard businessId={businessId} /> : null}
    </Screen>
  );
}

/**
 * Billing settings (Plan 6 Task 2), on the Billing tab — closest to use, not
 * global settings. Local edits overlay the server values (null = untouched);
 * one Save writes all three columns via the businesses owner-update RLS
 * policy. The memberships business embed does NOT carry these columns, so
 * only the dedicated query is invalidated.
 */
function BillingSettingsCard({ businessId }: { businessId: string }) {
  const t = useTheme();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AutoInvoiceMode | null>(null);
  const [venmoText, setVenmoText] = useState<string | null>(null);
  const [instructionsText, setInstructionsText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const billing = useQuery({
    queryKey: ['businessBilling', businessId],
    queryFn: () => getBusinessBilling(businessId),
  });

  const shownMode = mode ?? billing.data?.auto_invoice ?? 'per_visit';
  const shownVenmo = venmoText ?? billing.data?.venmo_handle ?? '';
  const shownInstructions = instructionsText ?? billing.data?.payment_instructions_md ?? '';
  const dirty = mode !== null || venmoText !== null || instructionsText !== null;

  const saveMut = useMutation({
    mutationFn: () =>
      updateBusinessBilling(businessId, {
        auto_invoice: shownMode,
        venmo_handle: normalizeVenmoHandle(shownVenmo),
        payment_instructions_md: shownInstructions.trim() || null,
      }),
    onSuccess: () => {
      setMode(null);
      setVenmoText(null);
      setInstructionsText(null);
      setError(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['businessBilling', businessId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  return (
    <Card style={{ gap: t.space.sm }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Billing settings</Text>
      {billing.error ? (
        <Text style={{ color: t.colors.danger }}>
          {billing.error instanceof Error ? billing.error.message : String(billing.error)}
        </Text>
      ) : null}
      {AUTO_INVOICE_MODES.map((m) => (
        <View key={m.value} style={{ gap: t.space.xs }}>
          <View style={{ flexDirection: 'row' }}>
            <Chip
              label={m.label}
              selected={shownMode === m.value}
              onPress={() => {
                setSaved(false);
                setMode(m.value);
              }}
            />
          </View>
          <Text style={{ color: t.colors.inkMuted }}>{m.hint}</Text>
        </View>
      ))}
      <TextField
        label="Venmo handle"
        value={shownVenmo}
        onChangeText={(v) => {
          setSaved(false);
          setVenmoText(v);
        }}
        placeholder="@your-handle"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextField
        label="Payment instructions"
        value={shownInstructions}
        onChangeText={(v) => {
          setSaved(false);
          setInstructionsText(v);
        }}
        placeholder="Zelle, checks, mailing address…"
        multiline
      />
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      {saved && !dirty ? <Text style={{ color: t.colors.inkMuted }}>Saved.</Text> : null}
      <Button
        title="Save billing settings"
        variant="secondary"
        onPress={() => saveMut.mutate()}
        loading={saveMut.isPending}
        disabled={!dirty || billing.isLoading}
      />
    </Card>
  );
}
