import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { formatCents } from '@/src/features/billing/money';
import {
  addPayoutItem,
  createPayoutStatement,
  finalizePayout,
  getPayoutStatement,
  listPayoutStatements,
  markPayoutPaid,
  payoutStatusChip,
  periodLabel,
  signedDollarsToCents,
  voidPayoutStatement,
} from '@/src/features/billing/payouts';
import { StatusBadge } from '@/src/features/billing/StatusBadge';
import { useActiveBusiness } from '@/src/features/business/active';
import { listActiveMembers, memberName, type ScheduleMember } from '@/src/features/schedule/api';
import { Chip } from '@/src/features/schedule/Chip';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { DateField } from '@/src/ui/DateField';
import { dateToYmd } from '@/src/ui/datetime';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

/**
 * Payout statements (Plan 6 Task 2): per-walker statement list, a "New
 * statement" flow (walker chips incl. the owner — owners walk too — plus a
 * DateField period), and an inline detail (deposits-screen precedent: one
 * route, list <-> detail via local state). Draft statements take signed manual
 * adjustments and Finalize (walker-visible from then on) / Void (deletes —
 * Task 1 rule); finalized ones take Mark paid.
 */

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function PayoutsScreen() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { businessId } = useActiveBusiness();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [walkerId, setWalkerId] = useState<string | null>(null);
  const [fromText, setFromText] = useState(() => dateToYmd(new Date()));
  const [toText, setToText] = useState(() => dateToYmd(new Date()));
  const [error, setError] = useState<string | null>(null);

  const statements = useQuery({
    queryKey: ['payouts', businessId],
    enabled: !!businessId,
    queryFn: () => listPayoutStatements(businessId!),
  });
  const members = useQuery({
    queryKey: ['members', businessId],
    enabled: !!businessId,
    queryFn: () => listActiveMembers(businessId!),
  });
  useRefetchOnFocus(statements.refetch);

  const createMut = useMutation({
    mutationFn: (args: { walkerId: string; from: string; to: string }) =>
      createPayoutStatement(args.walkerId, args.from, args.to),
    onSuccess: (id) => {
      setFormOpen(false);
      setWalkerId(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['payouts', businessId] });
      setSelectedId(id);
    },
    onError: (e) => setError(errorText(e)),
  });

  function submitCreate() {
    setError(null);
    if (!walkerId) return setError('Pick a walker');
    if (!fromText || !toText) return setError('Pick the full period');
    if (toText < fromText) return setError('The period end is before its start');
    createMut.mutate({ walkerId, from: fromText, to: toText });
  }

  const memberList = members.data ?? [];
  const picked = memberList.find((m) => m.user_id === walkerId);

  if (selectedId) {
    return (
      <StatementDetail
        businessId={businessId!}
        id={selectedId}
        members={memberList}
        onClose={() => {
          setSelectedId(null);
          void queryClient.invalidateQueries({ queryKey: ['payouts', businessId] });
        }}
      />
    );
  }

  const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.sm };
  const rowBetween = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: t.space.sm,
  };

  return (
    <Screen title="Payouts">
      <Button title="Back" variant="ghost" onPress={() => router.back()} />

      {!formOpen ? <Button title="New statement" onPress={() => setFormOpen(true)} /> : null}
      {formOpen ? (
        <Card style={{ gap: t.space.sm }}>
          <Text style={[t.type.label, { color: t.colors.inkMuted }]}>New payout statement</Text>
          <View style={chipRow}>
            {memberList.map((m) => (
              <Chip
                key={m.user_id}
                label={memberName(memberList, m.user_id)}
                selected={walkerId === m.user_id}
                onPress={() => setWalkerId(m.user_id)}
              />
            ))}
          </View>
          {picked ? (
            <Text style={{ color: t.colors.inkMuted }}>
              {memberName(memberList, picked.user_id)} is paid {Number(picked.payout_percent ?? 0)}%
              of each visit price.
            </Text>
          ) : null}
          <DateField label="From" value={fromText} onChange={setFromText} />
          <DateField label="To" value={toText} onChange={setToText} />
          <Button title="Create statement" onPress={submitCreate} loading={createMut.isPending} />
          <Button title="Close" variant="ghost" onPress={() => setFormOpen(false)} />
        </Card>
      ) : null}

      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      {statements.error ? (
        <Text style={{ color: t.colors.danger }}>{errorText(statements.error)}</Text>
      ) : null}

      {(statements.data ?? []).map((st) => {
        const chip = payoutStatusChip(st.status);
        return (
          <Pressable key={st.id} onPress={() => setSelectedId(st.id)}>
            <Card style={{ gap: t.space.xs }}>
              <View style={rowBetween}>
                <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
                  {memberName(memberList, st.walker_id)}
                </Text>
                <StatusBadge label={chip.label} tone={chip.tone} />
              </View>
              <View style={rowBetween}>
                <Text style={{ color: t.colors.inkMuted }}>
                  {periodLabel(st.period_start, st.period_end)}
                </Text>
                <Text style={{ color: t.colors.ink, fontWeight: '700', textAlign: 'right' }}>
                  {formatCents(st.total_cents)}
                </Text>
              </View>
            </Card>
          </Pressable>
        );
      })}
      {statements.isSuccess && (statements.data ?? []).length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>
          No payout statements yet. Create one to tally a walker’s completed visits.
        </Text>
      ) : null}
    </Screen>
  );
}

function StatementDetail({
  businessId,
  id,
  members,
  onClose,
}: {
  businessId: string;
  id: string;
  members: ScheduleMember[];
  onClose: () => void;
}) {
  const t = useTheme();
  const queryClient = useQueryClient();
  const [descText, setDescText] = useState('');
  const [amountText, setAmountText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['payout', businessId, id],
    queryFn: () => getPayoutStatement(businessId, id),
  });

  const refresh = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['payout', businessId, id] });
    void queryClient.invalidateQueries({ queryKey: ['payouts', businessId] });
  };
  const fail = (e: unknown) => setError(errorText(e));

  const addMut = useMutation({
    mutationFn: (args: { description: string; cents: number }) =>
      addPayoutItem(id, args.description, args.cents),
    onSuccess: () => {
      setDescText('');
      setAmountText('');
      refresh();
    },
    onError: fail,
  });
  const finalizeMut = useMutation({ mutationFn: finalizePayout, onSuccess: refresh, onError: fail });
  const paidMut = useMutation({ mutationFn: markPayoutPaid, onSuccess: refresh, onError: fail });
  const voidMut = useMutation({
    mutationFn: voidPayoutStatement,
    // The statement row is gone — leave the detail entirely.
    onSuccess: onClose,
    onError: fail,
  });

  function submitAdjustment() {
    setError(null);
    const description = descText.trim();
    if (!description) return setError('Describe the adjustment');
    const cents = signedDollarsToCents(amountText);
    if (cents === null) return setError('Enter a signed amount like 10.00 or -5.00');
    if (cents === 0) return setError('An adjustment cannot be zero');
    addMut.mutate({ description, cents });
  }

  function confirmFinalize(totalCents: number) {
    Alert.alert(
      'Finalize statement',
      `Freeze this statement at ${formatCents(totalCents)}? The walker will see it (and its items) from now on.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Finalize', onPress: () => finalizeMut.mutate(id) },
      ],
    );
  }
  function confirmVoid() {
    Alert.alert(
      'Void statement',
      'Delete this draft? Its visits become available for a future statement.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Void', style: 'destructive', onPress: () => voidMut.mutate(id) },
      ],
    );
  }
  function confirmPaid(totalCents: number) {
    Alert.alert(
      'Mark paid',
      `Record ${formatCents(totalCents)} as paid out? Send the money in your payment app first.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark paid', onPress: () => paidMut.mutate(id) },
      ],
    );
  }

  const st = detail.data;
  const chip = st ? payoutStatusChip(st.status) : null;
  const rowBetween = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: t.space.sm,
  };

  return (
    <Screen title="Payout statement">
      <Button title="Back" variant="ghost" onPress={onClose} />
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      {detail.error ? (
        <Text style={{ color: t.colors.danger }}>{errorText(detail.error)}</Text>
      ) : null}

      {st && chip ? (
        <>
          <Card style={{ gap: t.space.xs }}>
            <View style={rowBetween}>
              <Text style={[t.type.title, { color: t.colors.ink }]}>
                {memberName(members, st.walker_id)}
              </Text>
              <StatusBadge label={chip.label} tone={chip.tone} />
            </View>
            <Text style={{ color: t.colors.inkMuted }}>
              {periodLabel(st.period_start, st.period_end)}
            </Text>
            <View style={rowBetween}>
              <Text style={{ color: t.colors.inkMuted }}>Total</Text>
              <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
                {formatCents(st.total_cents)}
              </Text>
            </View>
          </Card>

          <Card style={{ gap: t.space.sm }}>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Items</Text>
            {st.items.map((item) => (
              <View key={item.id} style={rowBetween}>
                <Text style={{ color: t.colors.ink, flex: 1 }}>
                  {item.description}
                  {item.visit_id === null ? ' (adjustment)' : ''}
                </Text>
                <Text style={{ color: t.colors.ink, fontWeight: '700' }}>
                  {formatCents(item.amount_cents)}
                </Text>
              </View>
            ))}
            {st.items.length === 0 ? (
              <Text style={{ color: t.colors.inkMuted }}>
                No visits in this period. Add an adjustment or void the draft.
              </Text>
            ) : null}
          </Card>

          {st.status === 'draft' ? (
            <Card style={{ gap: t.space.sm }}>
              <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Add adjustment</Text>
              <TextField
                label="Description"
                value={descText}
                onChangeText={setDescText}
                placeholder="Gas bonus"
              />
              <TextField
                label="Amount ($, negative allowed)"
                value={amountText}
                onChangeText={setAmountText}
                placeholder="10.00"
                keyboardType="numbers-and-punctuation"
              />
              <Button title="Add" variant="secondary" onPress={submitAdjustment} loading={addMut.isPending} />
            </Card>
          ) : null}

          {st.status === 'draft' ? (
            <>
              <Button
                title="Finalize"
                onPress={() => confirmFinalize(st.total_cents)}
                loading={finalizeMut.isPending}
              />
              <Button title="Void" variant="ghost" onPress={confirmVoid} loading={voidMut.isPending} />
            </>
          ) : null}
          {st.status === 'finalized' ? (
            <Button
              title="Mark paid"
              onPress={() => confirmPaid(st.total_cents)}
              loading={paidMut.isPending}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
