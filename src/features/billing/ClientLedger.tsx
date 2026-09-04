import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { listAllDeposits, listInvoices } from '@/src/features/billing/api';
import { formatCents, formatIsoDate, invoiceBalance, invoiceNumberLabel, statusChip, sumCents } from '@/src/features/billing/money';
import { StatusBadge } from '@/src/features/billing/StatusBadge';
import { supabase } from '@/src/lib/supabase';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

/**
 * Inline client ledger (round 7b — sponsor: the Balance tap should reveal the
 * client's transactions RIGHT HERE, not bounce to Billing). Renders under the
 * expanded Balance card on the client profile: every invoice with its status
 * and open amount (tap-through to the invoice), collections (payments + tips),
 * and any held deposit. Owner-only data by RLS throughout.
 */

type LedgerPayment = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  tip_cents: number;
  method: string;
  received_on: string;
};

async function listPaymentsForInvoices(
  businessId: string,
  invoiceIds: string[],
): Promise<LedgerPayment[]> {
  if (invoiceIds.length === 0) return [];
  const { data, error } = await supabase
    .from('payments')
    .select('id, invoice_id, amount_cents, tip_cents, method, received_on')
    .eq('business_id', businessId)
    .in('invoice_id', invoiceIds)
    .order('received_on', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LedgerPayment[];
}

export function ClientLedger({ businessId, clientId }: { businessId: string; clientId: string }) {
  const t = useTheme();
  const router = useRouter();

  const invoices = useQuery({
    queryKey: ['invoices', businessId],
    queryFn: () => listInvoices(businessId),
  });
  const mine = (invoices.data ?? []).filter((i) => i.client_id === clientId);
  const ids = mine.map((i) => i.id);

  const payments = useQuery({
    queryKey: ['clientLedgerPayments', businessId, clientId, ids.length],
    enabled: ids.length > 0,
    queryFn: () => listPaymentsForInvoices(businessId, ids),
  });
  const deposits = useQuery({
    queryKey: ['deposits', businessId, 'all'],
    queryFn: () => listAllDeposits(businessId),
  });

  const held = (deposits.data ?? []).filter(
    (d) => d.client_id === clientId && d.status === 'held',
  );
  const collected = (payments.data ?? []).reduce((s, p) => s + p.amount_cents, 0);
  const tips = (payments.data ?? []).reduce((s, p) => s + p.tip_cents, 0);

  return (
    <Card style={{ gap: t.space.sm }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Transactions</Text>
      {mine.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>No invoices yet.</Text>
      ) : (
        mine.map((inv) => {
          const open = invoiceBalance(inv.items ?? [], inv.payments ?? []);
          return (
            <Pressable
              key={inv.id}
              accessibilityRole="button"
              onPress={() => router.push(`/billing/${inv.id}` as Href)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: t.space.sm,
                paddingVertical: t.space.sm,
                borderBottomWidth: 1,
                borderBottomColor: t.colors.line,
              }}
            >
              <View style={{ flexShrink: 1 }}>
                <Text style={{ color: t.colors.ink, fontWeight: '600' }}>
                  {invoiceNumberLabel(inv.number)}
                </Text>
                <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
                  {formatIsoDate(inv.issued_on)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                {(() => {
                  const chip = statusChip(inv, {
                    itemsCents: sumCents(inv.items ?? []),
                    paymentsCents: sumCents(inv.payments ?? []),
                  }, new Date());
                  return <StatusBadge label={chip.label} tone={chip.tone} />;
                })()}
                <Text
                  style={{
                    color: open > 0 ? t.colors.danger : t.colors.ink,
                    fontWeight: '700',
                  }}
                >
                  {open > 0 ? `${formatCents(open)} due` : formatCents(invoiceBalance(inv.items ?? [], []))}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
      {(payments.data ?? []).length > 0 ? (
        <Text style={{ color: t.colors.green }}>
          Collected {formatCents(collected)}
          {tips > 0 ? ` + ${formatCents(tips)} in tips` : ''} across{' '}
          {(payments.data ?? []).length} payment{(payments.data ?? []).length === 1 ? '' : 's'}
        </Text>
      ) : null}
      {held.length > 0 ? (
        <Text style={{ color: t.colors.green }}>
          Holding {formatCents(held.reduce((s, d) => s + d.amount_cents, 0))} in deposits
        </Text>
      ) : null}
    </Card>
  );
}
