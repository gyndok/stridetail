import { router, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { StatusBadge } from '@/src/features/billing/StatusBadge';
import { usePortalScope } from '@/src/features/portal/hooks';
import {
  portalInvoiceVm,
  usePortalInvoiceList,
  type PortalInvoiceVm,
} from '@/src/features/portal/invoicesApi';
import { PortalScreen } from '@/src/features/portal/PortalScreen';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

/**
 * Portal invoices tab (Plan 8 Task 5): every invoice the client can see
 * (sent|paid per RLS), newest first, with the shared status chips and the
 * true balance. A row deep-links to the public invoice page /invoice/<token>
 * — line items, payment history, tip chips, and the Venmo pay button, already
 * built and function-gated there. The token comes from the client's own RLS
 * read; a missing/revoked token keeps its row without a link (DEVIATIONS.md).
 */
export default function PortalInvoices() {
  const t = useTheme();
  const { link } = usePortalScope();
  const invoices = usePortalInvoiceList(link?.client_id ?? null);
  const now = new Date();

  return (
    <PortalScreen title="Invoices">
      {invoices.data?.map((inv) => <InvoiceRow key={inv.id} vm={portalInvoiceVm(inv, now)} />)}
      {invoices.isSuccess && !invoices.data?.length ? (
        <Card>
          <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
            No invoices yet — they appear here when your pet care provider sends one.
          </Text>
        </Card>
      ) : null}
      {!invoices.isSuccess && !invoices.isError ? (
        <ActivityIndicator color={t.colors.primary} />
      ) : null}
      {invoices.isError ? (
        <Card>
          <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
            Could not load your invoices. Please try again.
          </Text>
        </Card>
      ) : null}
    </PortalScreen>
  );
}

function InvoiceRow({ vm }: { vm: PortalInvoiceVm }) {
  const t = useTheme();
  const body = (
    <Card style={{ gap: t.space.xs }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: t.space.sm,
        }}
      >
        <Text style={{ color: t.colors.ink, fontWeight: '700' }}>{vm.numberLabel}</Text>
        <StatusBadge {...vm.chip} />
      </View>
      {vm.dateLine ? (
        <Text style={[t.type.body, { color: t.colors.inkMuted }]}>{vm.dateLine}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space.sm }}>
        <Text style={[t.type.body, { color: t.colors.inkMuted }]}>Total {vm.totalText}</Text>
        {vm.unpaid ? (
          <Text style={{ color: t.colors.ink, fontWeight: '700' }}>
            Balance {vm.balanceText}
          </Text>
        ) : null}
      </View>
      {vm.href ? (
        <Text style={[t.type.body, { color: t.colors.primary }]}>
          {vm.unpaid ? 'View & pay →' : 'View invoice →'}
        </Text>
      ) : null}
    </Card>
  );
  if (!vm.href) return body;
  const href = vm.href;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${vm.numberLabel}`}
      onPress={() => router.push(href as Href)}
    >
      {body}
    </Pressable>
  );
}
