import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  addInvoiceItem,
  createInvoice,
  listHeldDeposits,
  listUninvoicedVisits,
  uninvoicedVisitAmounts,
} from '@/src/features/billing/api';
import { formatCents, sumCents } from '@/src/features/billing/money';
import {
  depositPreview,
  eligibleVisitLine,
  filterByLocalDateRange,
  manualLineError,
  parseSignedDollars,
} from '@/src/features/billing/newInvoice';
import { useActiveBusiness } from '@/src/features/business/active';
import { listClients } from '@/src/features/clients/api';
import { Chip } from '@/src/features/schedule/Chip';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { DateField } from '@/src/ui/DateField';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

/**
 * New-invoice flow (Plan 5 Task 4). V1 SIMPLIFICATION (recorded in
 * DEVIATIONS.md): no per-visit checkboxes — create_invoice takes a date
 * RANGE, which cannot express an arbitrary unchecked subset. The eligible
 * visits render read-only and a from/to DateField pair (blank = no limit,
 * i.e. spanning all uninvoiced) filters the preview live and feeds the RPC,
 * so the preview and the created draft always agree.
 *
 * Amounts are TRUE snapshots via the uninvoiced_visit_amounts definer RPC
 * (Plan 6 Task 4) — the old current-price estimate and its "estimated"
 * caveat are gone; preview totals now match the draft to the cent.
 */

type ManualRow = { key: number; description: string; amountText: string };

export default function NewInvoice() {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();
  // The visit screen's "Add to an invoice" link preselects its client.
  const { client: clientParam } = useLocalSearchParams<{ client?: string }>();

  const [clientId, setClientId] = useState<string | null>(clientParam ?? null);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [manual, setManual] = useState<ManualRow[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ['clients', businessId, ''],
    enabled: !!businessId,
    queryFn: () => listClients(businessId!),
  });
  const visits = useQuery({
    queryKey: ['uninvoicedVisits', businessId, clientId],
    enabled: !!businessId && !!clientId,
    queryFn: () => listUninvoicedVisits(businessId!, clientId!),
  });
  // True stored snapshots per visit (definer RPC — the table's price column
  // grant hides them from every client role).
  const amounts = useQuery({
    queryKey: ['uninvoicedAmounts', businessId, clientId],
    enabled: !!businessId && !!clientId,
    queryFn: () => uninvoicedVisitAmounts(clientId!),
  });
  const deposits = useQuery({
    queryKey: ['deposits', businessId, 'held'],
    enabled: !!businessId,
    queryFn: () => listHeldDeposits(businessId!),
  });

  // Preview mirrors the RPC exactly (newInvoice.ts helpers): range-filtered
  // visit lines at their true snapshots, then the held queue consumed
  // stop-at-first-misfit against the true subtotal.
  const eligible = filterByLocalDateRange(
    visits.data ?? [],
    fromText.trim() || null,
    toText.trim() || null,
  );
  const amountByVisit = new Map((amounts.data ?? []).map((a) => [a.visit_id, a.amount_cents]));
  const lines = eligible.map((v) => eligibleVisitLine(v, amountByVisit.get(v.id) ?? 0));
  const subtotal = lines.reduce((sum, l) => sum + l.amountCents, 0);
  const clientHeld = (deposits.data ?? []).filter((d) => d.client_id === clientId);
  const preview = depositPreview(clientHeld, subtotal);
  const appliedIds = new Set(preview.applied.map((d) => d.id));
  const manualCents = manual
    .map((row) => parseSignedDollars(row.amountText))
    .filter((c): c is number => c !== null);
  const total = subtotal - preview.appliedCents + sumCents(
    manualCents.map((amount_cents) => ({ amount_cents })),
  );

  const updateRow = (key: number, patch: Partial<ManualRow>) =>
    setManual((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function create() {
    if (!businessId) return;
    setError(null);
    if (!clientId) return setError('Pick a client');
    for (const row of manual) {
      const rowError = manualLineError(row.description, row.amountText);
      if (rowError) return setError(`Manual line: ${rowError}`);
    }
    setBusy(true);
    try {
      const invoiceId = await createInvoice(
        clientId,
        fromText.trim() || null,
        toText.trim() || null,
      );
      for (const row of manual) {
        await addInvoiceItem(invoiceId, row.description.trim(), parseSignedDollars(row.amountText)!);
      }
      router.replace(`/billing/${invoiceId}` as Href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.sm };
  const rowBetween = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: t.space.sm,
  };

  return (
    <Screen title="New invoice">
      <Text style={[t.type.title, { color: t.colors.ink }]}>Client</Text>
      <View style={chipRow}>
        {(clients.data ?? []).map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={clientId === c.id}
            onPress={() => setClientId(c.id)}
          />
        ))}
      </View>
      {clients.isSuccess && clients.data.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>Add a client first (Clients tab).</Text>
      ) : null}

      {clientId ? (
        <>
          <Text style={[t.type.title, { color: t.colors.ink }]}>Completed visits</Text>
          <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
            Every un-invoiced completed visit in the date range below is included. Leave the
            dates blank to include them all.
          </Text>
          <DateField
            label="From"
            value={fromText}
            onChange={setFromText}
            placeholder="No limit"
            onClear={() => setFromText('')}
          />
          <DateField
            label="To"
            value={toText}
            onChange={setToText}
            placeholder="No limit"
            onClear={() => setToText('')}
          />
          {visits.error || amounts.error ? (
            <Text style={{ color: t.colors.danger }}>
              {[visits.error, amounts.error]
                .filter((e): e is Error => e instanceof Error)
                .map((e) => e.message)
                .join(' · ') || 'Could not load visits'}
            </Text>
          ) : null}
          <Card style={{ gap: t.space.sm }}>
            {eligible.map((v, i) => (
              <View key={v.id} style={rowBetween}>
                <Text style={{ color: t.colors.ink, flexShrink: 1 }}>{lines[i]!.description}</Text>
                <Text style={{ color: t.colors.ink, fontWeight: '700' }}>
                  {amountByVisit.has(v.id) ? formatCents(lines[i]!.amountCents) : '…'}
                </Text>
              </View>
            ))}
            {visits.isSuccess && eligible.length === 0 ? (
              <Text style={{ color: t.colors.inkMuted }}>
                No un-invoiced completed visits in this range.
              </Text>
            ) : null}
            {visits.isPending || amounts.isPending ? (
              <Text style={{ color: t.colors.inkMuted }}>Loading…</Text>
            ) : null}
          </Card>

          {clientHeld.length > 0 ? (
            <>
              <Text style={[t.type.title, { color: t.colors.ink }]}>Held deposits</Text>
              <Card style={{ gap: t.space.sm }}>
                {clientHeld.map((d) => (
                  <View key={d.id} style={rowBetween}>
                    <Text style={{ color: t.colors.ink }}>
                      {appliedIds.has(d.id) ? 'Will apply' : 'Stays held'}
                      {d.received_on ? ` · ${d.received_on}` : ''}
                    </Text>
                    <Text
                      style={{
                        color: appliedIds.has(d.id) ? t.colors.green : t.colors.inkMuted,
                        fontWeight: '700',
                      }}
                    >
                      {appliedIds.has(d.id) ? formatCents(-d.amount_cents) : formatCents(d.amount_cents)}
                    </Text>
                  </View>
                ))}
                <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
                  Oldest deposits apply first, whole deposits only, stopping at the first that
                  no longer fits the visit subtotal.
                </Text>
              </Card>
            </>
          ) : null}

          <Text style={[t.type.title, { color: t.colors.ink }]}>Manual lines</Text>
          {manual.map((row) => (
            <Card key={row.key} style={{ gap: t.space.sm }}>
              <TextField
                label="Description"
                value={row.description}
                onChangeText={(text) => updateRow(row.key, { description: text })}
                placeholder="e.g. Key pickup, Discount"
              />
              <TextField
                label="Amount ($, negative for a discount)"
                value={row.amountText}
                onChangeText={(text) => updateRow(row.key, { amountText: text })}
                placeholder="12.50 or -5.00"
                keyboardType="numbers-and-punctuation"
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setManual((cur) => cur.filter((r) => r.key !== row.key))}
              >
                <Text style={{ color: t.colors.danger, fontWeight: '700' }}>Remove line</Text>
              </Pressable>
            </Card>
          ))}
          <Button
            title="Add manual line"
            variant="secondary"
            onPress={() => {
              setManual((cur) => [...cur, { key: nextKey, description: '', amountText: '' }]);
              setNextKey((k) => k + 1);
            }}
          />

          <Card style={{ gap: t.space.xs }}>
            <View style={rowBetween}>
              <Text style={{ color: t.colors.inkMuted }}>Visits</Text>
              <Text style={{ color: t.colors.ink }}>{formatCents(subtotal)}</Text>
            </View>
            <View style={rowBetween}>
              <Text style={{ color: t.colors.inkMuted }}>Deposits applied</Text>
              <Text style={{ color: t.colors.ink }}>{formatCents(-preview.appliedCents)}</Text>
            </View>
            <View style={rowBetween}>
              <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>Total</Text>
              <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
                {formatCents(total)}
              </Text>
            </View>
          </Card>
        </>
      ) : null}

      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      <Button title="Create draft" onPress={() => void create()} loading={busy} disabled={!clientId} />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
