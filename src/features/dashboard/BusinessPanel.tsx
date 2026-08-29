import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { balanceView, useClientBalances } from '@/src/features/billing/clientBalances';
import { formatCents, unpaidTotalCents } from '@/src/features/billing/money';
import { StatusBadge } from '@/src/features/billing/StatusBadge';
import { useActiveBusiness } from '@/src/features/business/active';
import { firstPhone } from '@/src/features/clients/api';
import { centsToDollarsString } from '@/src/features/services/form';
import { TextField } from '@/src/ui/TextField';
import { useTheme, type Theme } from '@/src/ui/theme';

import {
  capRows,
  clientFlags,
  filterClients,
  invoiceRowView,
  petsSummary,
  useBusinessBilling,
  useBusinessClients,
  useBusinessServices,
} from './businessData';
import { PanelCard } from './PanelCard';
import { PanelSkeleton } from './PanelSkeleton';

// Plan 8b Task 4 — the business column: clients & pets roster, services
// catalog, billing hub. Same no-props export as the Task 1 stub; all data
// comes from businessData.ts hooks (which reuse the clients/services/billing
// feature queries), all money labels from billing/money.ts.

const CLIENT_ROW_CAP = 8;
const INVOICE_ROW_CAP = 8;

function queryError(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}

function CardStatus({ error, empty, emptyLabel }: { error: unknown; empty: boolean; emptyLabel: string }) {
  const t = useTheme();
  const message = queryError(error);
  if (message) return <Text style={{ color: t.colors.danger }}>{message}</Text>;
  if (empty) return <Text style={{ color: t.colors.inkMuted }}>{emptyLabel}</Text>;
  return null;
}

/** Muted list row divider spacing shared by the three cards. */
function rowStyle(t: Theme) {
  return { gap: t.space.xs / 2, paddingVertical: t.space.xs };
}

export function BusinessPanel() {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();
  const [search, setSearch] = useState('');

  const clients = useBusinessClients(businessId);
  const services = useBusinessServices(businessId);
  const billing = useBusinessBilling(businessId);
  const balances = useClientBalances(businessId);

  const term = search.trim();
  const filtered = filterClients(clients.data ?? [], term);
  const roster = capRows(filtered, CLIENT_ROW_CAP);

  const invoices = billing.data?.invoices ?? [];
  const recent = capRows(invoices, INVOICE_ROW_CAP);
  const now = new Date();

  return (
    <View style={{ gap: t.space.md }}>
      <PanelCard
        title="Clients & pets"
        action={{ label: 'Add client', onPress: () => router.push('/clients/new' as Href) }}
      >
        <TextField
          label="Search clients"
          value={search}
          onChangeText={setSearch}
          placeholder="Client or pet name"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {clients.isLoading ? <PanelSkeleton /> : null}
        {roster.visible.map((c) => {
          const flags = clientFlags(c);
          const phone = firstPhone(c.phones);
          const balance = balanceView(balances.data?.get(c.id));
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => router.push(`/clients/${c.id}` as Href)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, ...rowStyle(t) })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
                <Text style={[t.type.body, { color: t.colors.ink, flexShrink: 1 }]}>{c.name}</Text>
                {flags.noEmail ? <StatusBadge label="No email" tone="warning" /> : null}
                {flags.meetGreetPending ? <StatusBadge label="M&G pending" tone="neutral" /> : null}
                {balance ? (
                  <Text
                    style={{
                      color: balance.tone === 'green' ? t.colors.green : t.colors.danger,
                      fontWeight: '700',
                      fontSize: 13,
                      marginLeft: 'auto',
                    }}
                  >
                    {balance.text}
                  </Text>
                ) : null}
              </View>
              <Text style={{ color: t.colors.inkMuted, fontSize: 13 }}>
                {petsSummary(c.pets)}
                {phone ? ` · ${phone}` : ''}
              </Text>
            </Pressable>
          );
        })}
        <CardStatus
          error={clients.error}
          empty={!!clients.data && filtered.length === 0}
          emptyLabel={term ? 'No clients match your search.' : 'No clients yet.'}
        />
        {roster.moreCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/clients' as Href)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: t.colors.primary, fontWeight: '700' }}>
              +{roster.moreCount} more
            </Text>
          </Pressable>
        ) : null}
      </PanelCard>

      <PanelCard title="Services">
        {services.isLoading ? <PanelSkeleton /> : null}
        {(services.data ?? []).map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => router.push('/settings/services' as Href)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, ...rowStyle(t) })}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: t.space.sm,
              }}
            >
              <Text style={[t.type.body, { color: t.colors.ink, flexShrink: 1 }]}>{s.name}</Text>
              <Text style={{ color: t.colors.inkMuted, fontSize: 13 }}>
                {s.duration_min} min · ${centsToDollarsString(s.base_price_cents)}
                {s.extra_pet_price_cents > 0
                  ? ` · +$${centsToDollarsString(s.extra_pet_price_cents)}/extra pet`
                  : ''}
              </Text>
            </View>
          </Pressable>
        ))}
        <CardStatus
          error={services.error}
          empty={!!services.data && services.data.length === 0}
          emptyLabel="No services yet."
        />
      </PanelCard>

      <PanelCard
        title="Billing"
        action={{ label: 'View billing', onPress: () => router.push('/billing' as Href) }}
      >
        {billing.isLoading ? <PanelSkeleton /> : null}
        {billing.data ? (
          <Text style={{ color: t.colors.inkMuted }}>
            Outstanding {formatCents(unpaidTotalCents(invoices))} · {billing.data.unbilledCount}{' '}
            unbilled visits
          </Text>
        ) : null}
        {recent.visible.map((inv) => {
          const row = invoiceRowView(inv, now);
          return (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              onPress={() => router.push(`/billing/${row.id}` as Href)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, ...rowStyle(t) })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
                <Text style={{ color: t.colors.ink, fontWeight: '700' }}>{row.label}</Text>
                <Text style={{ color: t.colors.inkMuted, flexShrink: 1, flexGrow: 1 }}>
                  {row.clientName}
                </Text>
                <Text style={{ color: t.colors.ink }}>{row.amountLabel}</Text>
                <StatusBadge label={row.chip.label} tone={row.chip.tone} />
              </View>
            </Pressable>
          );
        })}
        <CardStatus
          error={billing.error}
          empty={!!billing.data && invoices.length === 0}
          emptyLabel="No invoices yet."
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/billing/new' as Href)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ color: t.colors.primary, fontWeight: '700' }}>New invoice</Text>
        </Pressable>
      </PanelCard>
    </View>
  );
}
