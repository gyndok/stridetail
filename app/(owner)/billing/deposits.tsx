import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  forfeitDeposit,
  groupHeldDeposits,
  listAllDeposits,
  listHeldDeposits,
  recordDeposit,
  refundDeposit,
} from '@/src/features/billing/api';
import {
  depositStatusChip,
  formatCents,
  formatIsoDate,
  methodLabel,
  PAYMENT_METHODS,
} from '@/src/features/billing/money';
import { StatusBadge } from '@/src/features/billing/StatusBadge';
import { useActiveBusiness } from '@/src/features/business/active';
import { listClients } from '@/src/features/clients/api';
import { Chip } from '@/src/features/schedule/Chip';
import { dollarsStringToCents } from '@/src/features/services/form';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { DateField } from '@/src/ui/DateField';
import { dateToYmd } from '@/src/ui/datetime';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

import type { PaymentMethod } from '@/src/features/billing/types';
import { errorText } from '@/src/lib/errorText';

/**
 * Deposit ledger (Plan 5 Task 4): held/all toggle over the client-grouped
 * queue (groupHeldDeposits preserves the auto-apply order), a record form
 * (recordDeposit lands straight in held — Task 2 rule), and held-only
 * Refund / Forfeit exits behind destructive confirms.
 */

export default function DepositsScreen() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { businessId } = useActiveBusiness();

  const [view, setView] = useState<'held' | 'all'>('held');
  const [formOpen, setFormOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [receivedText, setReceivedText] = useState(() => dateToYmd(new Date()));
  const [memoText, setMemoText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const held = useQuery({
    queryKey: ['deposits', businessId, 'held'],
    enabled: !!businessId,
    queryFn: () => listHeldDeposits(businessId!),
  });
  const all = useQuery({
    queryKey: ['deposits', businessId, 'all'],
    enabled: !!businessId && view === 'all',
    queryFn: () => listAllDeposits(businessId!),
  });
  const clients = useQuery({
    queryKey: ['clients', businessId, ''],
    enabled: !!businessId,
    queryFn: () => listClients(businessId!),
  });
  useRefetchOnFocus(held.refetch);

  const refresh = () => {
    setError(null);
    setConfirmDeposit(null);
    void queryClient.invalidateQueries({ queryKey: ['deposits', businessId, 'held'] });
    void queryClient.invalidateQueries({ queryKey: ['deposits', businessId, 'all'] });
  };
  const fail = (e: unknown) => setError(errorText(e));

  const recordMut = useMutation({
    mutationFn: (args: { clientId: string; cents: number }) =>
      recordDeposit(args.clientId, args.cents, {
        method,
        receivedOn: receivedText || null,
        memo: memoText.trim() || null,
      }),
    onSuccess: () => {
      setFormOpen(false);
      setClientId(null);
      setAmountText('');
      setMethod(null);
      setMemoText('');
      refresh();
    },
    onError: fail,
  });
  const forfeitMut = useMutation({ mutationFn: forfeitDeposit, onSuccess: refresh, onError: fail });
  const refundMut = useMutation({ mutationFn: refundDeposit, onSuccess: refresh, onError: fail });

  // Alert.alert buttons no-op on web (team.tsx lesson) — refund/forfeit
  // confirm inline on the deposit card instead.
  const [confirmDeposit, setConfirmDeposit] = useState<{
    id: string;
    kind: 'refund' | 'forfeit';
  } | null>(null);

  function submitRecord() {
    setError(null);
    if (!clientId) return setError('Pick a client');
    const cents = dollarsStringToCents(amountText);
    if (cents === null || cents <= 0) return setError('Enter a deposit amount like 50.00');
    recordMut.mutate({ clientId, cents });
  }

  const rows = view === 'held' ? (held.data ?? []) : (all.data ?? []);
  const groups = groupHeldDeposits(rows);
  const activeQuery = view === 'held' ? held : all;

  const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.sm };
  const rowBetween = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: t.space.sm,
  };

  return (
    <Screen title="Deposits">
      <Button title="Back" variant="ghost" onPress={() => router.back()} />

      {!formOpen ? <Button title="Record deposit" onPress={() => setFormOpen(true)} /> : null}
      {formOpen ? (
        <Card style={{ gap: t.space.sm }}>
          <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Record deposit</Text>
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
          <TextField
            label="Amount ($)"
            value={amountText}
            onChangeText={setAmountText}
            placeholder="50.00"
            keyboardType="numbers-and-punctuation"
          />
          <View style={chipRow}>
            {PAYMENT_METHODS.map((m) => (
              <Chip
                key={m.value}
                label={m.label}
                selected={method === m.value}
                onPress={() => setMethod((cur) => (cur === m.value ? null : m.value))}
              />
            ))}
          </View>
          <DateField
            label="Received"
            value={receivedText}
            onChange={setReceivedText}
            onClear={() => setReceivedText('')}
          />
          <TextField label="Memo (optional)" value={memoText} onChangeText={setMemoText} />
          <Button title="Save deposit" onPress={submitRecord} loading={recordMut.isPending} />
          <Button title="Close" variant="ghost" onPress={() => setFormOpen(false)} />
        </Card>
      ) : null}

      <View style={chipRow}>
        <Chip label="Held" selected={view === 'held'} onPress={() => setView('held')} />
        <Chip label="All" selected={view === 'all'} onPress={() => setView('all')} />
      </View>

      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      {activeQuery.error ? (
        <Text style={{ color: t.colors.danger }}>{errorText(activeQuery.error)}</Text>
      ) : null}

      {groups.map((group) => (
        <View key={group.clientId} style={{ gap: t.space.sm }}>
          <View style={rowBetween}>
            <Text style={[t.type.title, { color: t.colors.ink }]}>{group.clientName}</Text>
            <Text style={{ color: t.colors.inkMuted, fontWeight: '700' }}>
              {formatCents(group.totalCents)}
            </Text>
          </View>
          {group.deposits.map((d) => {
            const chip = depositStatusChip(d.status);
            return (
              <Card key={d.id} style={{ gap: t.space.sm }}>
                <View style={rowBetween}>
                  <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
                    {formatCents(d.amount_cents)}
                  </Text>
                  <StatusBadge label={chip.label} tone={chip.tone} />
                </View>
                <Text style={{ color: t.colors.inkMuted }}>
                  {methodLabel(d.method)}
                  {d.received_on ? ` · ${formatIsoDate(d.received_on)}` : ''}
                </Text>
                {d.memo ? <Text style={{ color: t.colors.inkMuted }}>{d.memo}</Text> : null}
                {d.status === 'held' && confirmDeposit?.id !== d.id ? (
                  <View style={chipRow}>
                    <Button
                      title="Refund"
                      variant="secondary"
                      onPress={() => setConfirmDeposit({ id: d.id, kind: 'refund' })}
                    />
                    <Button
                      title="Forfeit"
                      variant="ghost"
                      onPress={() => setConfirmDeposit({ id: d.id, kind: 'forfeit' })}
                    />
                  </View>
                ) : null}
                {d.status === 'held' && confirmDeposit?.id === d.id ? (
                  <View style={{ gap: t.space.sm }}>
                    <Text style={{ color: t.colors.ink }}>
                      {confirmDeposit.kind === 'refund'
                        ? `Mark ${formatCents(d.amount_cents)} as returned to the client? Send the money back in your payment app first.`
                        : `Keep ${formatCents(d.amount_cents)} per your cancellation policy? The deposit will no longer apply to invoices.`}
                    </Text>
                    <View style={chipRow}>
                      <Button
                        title={confirmDeposit.kind === 'refund' ? 'Really refund' : 'Really forfeit'}
                        variant="secondary"
                        onPress={() =>
                          confirmDeposit.kind === 'refund'
                            ? refundMut.mutate(d.id)
                            : forfeitMut.mutate(d.id)
                        }
                        loading={refundMut.isPending || forfeitMut.isPending}
                      />
                      <Button
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setConfirmDeposit(null)}
                      />
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      ))}
      {activeQuery.isSuccess && groups.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>
          {view === 'held'
            ? 'No held deposits. Record one when a client pays ahead.'
            : 'No deposits recorded yet.'}
        </Text>
      ) : null}
    </Screen>
  );
}
