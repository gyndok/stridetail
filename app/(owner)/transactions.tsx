import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { fetchClientStatementData, walkerLedger } from '@/src/features/billing/api';
import { formatCents, formatIsoDate } from '@/src/features/billing/money';
import { printStatement } from '@/src/features/billing/statementPrint';
import {
  buildClientStatement,
  buildWalkerStatement,
  type Statement,
  type StatementRange,
} from '@/src/features/billing/statements';
import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { listClients } from '@/src/features/clients/api';
import { Chip } from '@/src/features/schedule/Chip';
import { listActiveMembers, memberName } from '@/src/features/schedule/api';
import { errorText } from '@/src/lib/errorText';
import { dateToYmd } from '@/src/ui/datetime';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { DateField } from '@/src/ui/DateField';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

/**
 * Transactions (2026-09-05 — sponsor: FreshBooks-style account statement,
 * "a left nav bar item called transactions... a toggle at the top
 * clients/walkers... printing/export to pdf is a must"). Web-rail entry only
 * (the manual pattern hides it from native tabs). One person at a time —
 * a client's account or a walker's finances — over a date range, with a
 * running balance and a print stylesheet that turns the browser's Print
 * (⌘P → Save as PDF) into a clean statement.
 */

const PRESETS = [
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
] as const;
type PresetKey = (typeof PRESETS)[number]['key'];

function presetRange(key: PresetKey, custom: { from: string; to: string }): StatementRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const ymd = (d: Date) => dateToYmd(d);
  if (key === 'month') return { from: ymd(new Date(y, m, 1)) };
  if (key === 'last') return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
  if (key === 'year') return { from: ymd(new Date(y, 0, 1)) };
  if (key === 'custom')
    return {
      ...(custom.from.trim() && { from: custom.from.trim() }),
      ...(custom.to.trim() && { to: custom.to.trim() }),
    };
  return {};
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const t = useTheme();
  const weight = bold ? ('700' as const) : ('400' as const);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: t.colors.ink, fontWeight: weight }}>{label}</Text>
      <Text style={{ color: t.colors.ink, fontWeight: weight, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

export default function TransactionsScreen() {
  const t = useTheme();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const businessName =
    memberships.data?.find((m) => m.business_id === businessId)?.business.name ?? '';

  const [mode, setMode] = useState<'clients' | 'walkers'>('clients');
  const [personId, setPersonId] = useState<string | null>(null);
  const [preset, setPreset] = useState<PresetKey>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = presetRange(preset, { from: customFrom, to: customTo });

  const clients = useQuery({
    queryKey: ['clients', businessId, ''],
    enabled: !!businessId,
    queryFn: () => listClients(businessId!),
  });
  const members = useQuery({
    queryKey: ['scheduleMembers', businessId],
    enabled: !!businessId,
    queryFn: () => listActiveMembers(businessId!),
  });

  const clientData = useQuery({
    queryKey: ['clientStatement', businessId, personId],
    enabled: !!businessId && !!personId && mode === 'clients',
    queryFn: () => fetchClientStatementData(businessId!, personId!),
  });
  const walkerData = useQuery({
    queryKey: ['walkerLedger', businessId, personId],
    enabled: !!businessId && !!personId && mode === 'walkers',
    queryFn: () => walkerLedger(businessId!, personId!),
  });

  const active = mode === 'clients' ? clientData : walkerData;
  let statement: Statement | null = null;
  if (mode === 'clients' && clientData.data) {
    statement = buildClientStatement({ ...clientData.data, range });
  } else if (mode === 'walkers' && walkerData.data) {
    statement = buildWalkerStatement({ rows: walkerData.data, range });
  }

  const personName =
    mode === 'clients'
      ? (clients.data ?? []).find((c) => c.id === personId)?.name ?? ''
      : personId
        ? memberName(members.data ?? [], personId)
        : '';
  const owesLabel = mode === 'clients' ? 'owes' : 'is owed';
  const chargeHeader = mode === 'clients' ? 'Charge' : 'Earned';
  const creditHeader = mode === 'clients' ? 'Paid' : 'Paid out';
  const rangeLabel = [
    range.from ? formatIsoDate(range.from) : 'the beginning',
    range.to ? formatIsoDate(range.to) : 'today',
  ].join(' – ');

  const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.sm };
  const money = (cents: number) => formatCents(cents);

  return (
    <Screen title="Transactions">
      <View style={{ gap: t.space.sm }}>
        <View style={chipRow}>
          <Chip
            label="Clients"
            selected={mode === 'clients'}
            onPress={() => {
              setMode('clients');
              setPersonId(null);
            }}
          />
          <Chip
            label="Walkers"
            selected={mode === 'walkers'}
            onPress={() => {
              setMode('walkers');
              setPersonId(null);
            }}
          />
        </View>
        <View style={chipRow}>
          {mode === 'clients'
            ? (clients.data ?? []).map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={personId === c.id}
                  onPress={() => setPersonId(c.id)}
                />
              ))
            : (members.data ?? []).map((m) => (
                <Chip
                  key={m.user_id}
                  label={m.display_name ?? 'Team member'}
                  selected={personId === m.user_id}
                  onPress={() => setPersonId(m.user_id)}
                />
              ))}
        </View>
        <View style={chipRow}>
          {PRESETS.map((p) => (
            <Chip key={p.key} label={p.label} selected={preset === p.key} onPress={() => setPreset(p.key)} />
          ))}
        </View>
        {preset === 'custom' ? (
          <View style={{ flexDirection: 'row', gap: t.space.sm }}>
            <View style={{ flex: 1 }}>
              <DateField label="From" value={customFrom} onChange={setCustomFrom} onClear={() => setCustomFrom('')} placeholder="No limit" />
            </View>
            <View style={{ flex: 1 }}>
              <DateField label="To" value={customTo} onChange={setCustomTo} onClear={() => setCustomTo('')} placeholder="No limit" />
            </View>
          </View>
        ) : null}
        {statement && Platform.OS === 'web' ? (
          <Button
            title="Print / save as PDF"
            variant="secondary"
            onPress={() =>
              printStatement(statement!, {
                businessName,
                personName,
                mode,
                rangeLabel,
                generatedYmd: dateToYmd(new Date()),
              })
            }
          />
        ) : null}
      </View>

      {!personId ? (
        <Text style={{ color: t.colors.inkMuted }}>
          Pick a {mode === 'clients' ? 'client' : 'walker'} to see their statement.
        </Text>
      ) : null}
      {active.error ? (
        <Text style={{ color: t.colors.danger }}>{errorText(active.error)}</Text>
      ) : null}
      {personId && active.isLoading ? (
        <Text style={{ color: t.colors.inkMuted }}>Loading…</Text>
      ) : null}

      {statement && personId ? (
        <>
          <Card style={{ gap: t.space.xs }}>
            <Text style={[t.type.title, { color: t.colors.ink }]}>{personName}</Text>
            <Text style={{ color: t.colors.inkMuted }}>
              {businessName} · Account statement · {rangeLabel} · generated {formatIsoDate(dateToYmd(new Date()))}
            </Text>
            <View style={{ height: t.space.sm }} />
            <SummaryRow label="Balance forward" value={money(statement.summary.forwardCents)} />
            <SummaryRow
              label={mode === 'clients' ? 'Invoiced' : 'Earned'}
              value={money(statement.summary.chargedCents)}
            />
            <SummaryRow
              label={mode === 'clients' ? 'Payments & deposits applied' : 'Paid out'}
              value={`−${money(statement.summary.creditedCents)}`}
            />
            <SummaryRow
              label={`${personName || 'They'} ${owesLabel}`}
              value={money(statement.summary.balanceCents)}
              bold
            />
            <View style={{ height: t.space.xs }} />
            {statement.summary.tipsCents > 0 ? (
              <Text style={{ color: t.colors.green }}>
                Tips {mode === 'clients' ? 'given' : 'earned'} in this period:{' '}
                {money(statement.summary.tipsCents)}
                {mode === 'clients' ? ' — never counted toward the balance' : ''}
              </Text>
            ) : null}
            {mode === 'clients' && (statement.summary.heldCents ?? 0) > 0 ? (
              <Text style={{ color: t.colors.green }}>
                Held for future care: {money(statement.summary.heldCents!)} — separate from the
                balance above
              </Text>
            ) : null}
          </Card>

          <Card style={{ gap: 0 }}>
            <View
              style={{
                flexDirection: 'row',
                paddingVertical: t.space.xs,
                borderBottomWidth: 2,
                borderBottomColor: t.colors.line,
              }}
            >
              <Text style={[t.type.label, { color: t.colors.inkMuted, width: 96 }]}>Date</Text>
              <Text style={[t.type.label, { color: t.colors.inkMuted, flex: 1 }]}>Description</Text>
              <Text style={[t.type.label, { color: t.colors.inkMuted, width: 90, textAlign: 'right' }]}>
                {chargeHeader}
              </Text>
              <Text style={[t.type.label, { color: t.colors.inkMuted, width: 90, textAlign: 'right' }]}>
                {creditHeader}
              </Text>
              <Text style={[t.type.label, { color: t.colors.inkMuted, width: 100, textAlign: 'right' }]}>
                Balance
              </Text>
            </View>
            {statement.rows.length === 0 ? (
              <Text style={{ color: t.colors.inkMuted, paddingVertical: t.space.sm }}>
                No activity in this period.
              </Text>
            ) : null}
            {statement.rows.map((r, i) => (
              <View
                key={`${r.date}-${i}`}
                style={{
                  flexDirection: 'row',
                  paddingVertical: t.space.xs,
                  borderBottomWidth: 1,
                  borderBottomColor: t.colors.line,
                  opacity: r.info ? 0.75 : 1,
                }}
              >
                <Text style={{ color: t.colors.inkMuted, width: 96, fontSize: 13 }}>
                  {formatIsoDate(r.date)}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.colors.ink, fontSize: 14 }}>{r.description}</Text>
                  {r.note ? (
                    <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>{r.note}</Text>
                  ) : null}
                </View>
                <Text
                  style={{ color: t.colors.ink, width: 90, textAlign: 'right', fontSize: 14, fontVariant: ['tabular-nums'] }}
                >
                  {r.chargeCents !== 0 ? money(r.chargeCents) : '—'}
                </Text>
                <Text
                  style={{ color: t.colors.green, width: 90, textAlign: 'right', fontSize: 14, fontVariant: ['tabular-nums'] }}
                >
                  {r.creditCents !== 0 ? money(r.creditCents) : '—'}
                </Text>
                <Text
                  style={{
                    color: r.balanceCents > 0 ? t.colors.danger : t.colors.ink,
                    width: 100,
                    textAlign: 'right',
                    fontSize: 14,
                    fontWeight: '600',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {r.info ? '' : money(r.balanceCents)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/** Kept for parity with other web-leaning screens; used by tests. */
export { presetRange };
