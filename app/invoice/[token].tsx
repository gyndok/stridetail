import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fetchPublicInvoice,
  invoiceViewModel,
  InvoiceUnavailableError,
  type InvoicePayload,
} from '@/src/features/billing/publicInvoice';
import { APP_NAME } from '@/src/lib/brand';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

// Public invoice page (Plan 5 Task 5). Direct-linked from the client's email —
// this route lives OUTSIDE the auth gate (app/index.tsx only redirects its own
// '/' route; like /report/[token], the root Stack hosts this straight from the
// URL) and fetches invoice-public with a PLAIN fetch: no session, no JWT (the
// function has verify_jwt off; the token is the credential). A voided invoice
// never renders — the function 404s it, indistinguishable from unknown.
// Unlike the report page there is no web-only <svg>: every section here is
// plain RN markup, so native and web render the same page.

function PaidStamp() {
  const t = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: t.colors.greenSoft,
        borderRadius: t.radius.input,
        paddingHorizontal: t.space.md,
        paddingVertical: t.space.xs,
      }}
    >
      <Text style={{ color: t.colors.green, fontWeight: '700', letterSpacing: 1 }}>PAID</Text>
    </View>
  );
}

function TotalsRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const t = useTheme();
  const weight = bold ? ('700' as const) : ('400' as const);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: t.colors.ink, fontWeight: weight }}>{label}</Text>
      <Text style={{ color: t.colors.ink, fontWeight: weight }}>{value}</Text>
    </View>
  );
}

function InvoiceBody({ payload }: { payload: InvoicePayload }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const vm = invoiceViewModel(payload);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.surface }}
      contentContainerStyle={{ paddingBottom: insets.bottom + t.space.xxl }}
    >
      <View
        style={{
          // The business's own brand color — server data, not a literal.
          backgroundColor: payload.business.brandColor,
          paddingTop: insets.top + t.space.xl,
          paddingBottom: t.space.xl,
          paddingHorizontal: t.space.lg,
          gap: t.space.sm,
        }}
      >
        {payload.business.logoUrl ? (
          <Image
            source={{ uri: payload.business.logoUrl }}
            style={{ width: 56, height: 56, borderRadius: t.radius.input }}
            resizeMode="cover"
          />
        ) : null}
        <Text style={[t.type.hero, { color: t.colors.onPrimary }]}>{payload.business.name}</Text>
        <Text style={[t.type.body, { color: t.colors.onPrimary, opacity: 0.9 }]}>Invoice</Text>
      </View>

      <View style={{ padding: t.space.lg, gap: t.space.md }}>
        <Card style={{ gap: t.space.xs }}>
          <Text style={[t.type.title, { color: t.colors.ink }]}>{vm.title}</Text>
          {vm.clientLine ? <Text style={{ color: t.colors.inkMuted }}>{vm.clientLine}</Text> : null}
          <Text style={{ color: t.colors.inkMuted }}>
            {[vm.issuedLine, vm.dueLine].filter(Boolean).join(' · ')}
          </Text>
          {vm.paid ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm, marginTop: t.space.xs }}>
              <PaidStamp />
              {vm.paidLine ? <Text style={{ color: t.colors.green }}>{vm.paidLine}</Text> : null}
            </View>
          ) : null}
        </Card>

        {vm.items.length > 0 ? (
          <Card style={{ gap: t.space.sm }}>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Items</Text>
            {vm.items.map((it, i) => (
              <View key={`${it.description}-${i}`} style={{ flexDirection: 'row', gap: t.space.sm }}>
                <Text style={{ color: it.isCredit ? t.colors.green : t.colors.ink, flex: 1 }}>
                  {it.description}
                </Text>
                <Text style={{ color: it.isCredit ? t.colors.green : t.colors.ink }}>
                  {it.amountText}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Card style={{ gap: t.space.sm }}>
          <TotalsRow label="Total" value={vm.totalText} />
          {vm.paymentsText ? <TotalsRow label="Payments" value={vm.paymentsText} /> : null}
          <TotalsRow label={vm.paid ? 'Balance' : 'Balance due'} value={vm.balanceText} bold />
        </Card>

        {payload.paymentInstructionsMd ? (
          <Card style={{ gap: t.space.sm }}>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>How to pay</Text>
            <Text style={{ color: t.colors.ink }}>{payload.paymentInstructionsMd}</Text>
          </Card>
        ) : null}

        <Text style={{ color: t.colors.inkMuted, textAlign: 'center', fontSize: 12 }}>
          Powered by {APP_NAME}
        </Text>
      </View>
    </ScrollView>
  );
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        padding: t.space.xl,
      }}
    >
      {children}
    </View>
  );
}

export default function PublicInvoice() {
  const t = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const invoice = useQuery({
    queryKey: ['publicInvoice', token],
    enabled: !!token,
    retry: (count, err) => !(err instanceof InvoiceUnavailableError) && count < 2,
    queryFn: () => fetchPublicInvoice(token!),
  });

  if (invoice.data) return <InvoiceBody payload={invoice.data} />;
  if (invoice.error) {
    const gone = invoice.error instanceof InvoiceUnavailableError;
    return (
      <CenteredNote>
        <Text style={[t.type.title, { color: t.colors.ink, textAlign: 'center' }]}>
          {gone ? 'This invoice is no longer available.' : 'Something went wrong.'}
        </Text>
        {!gone ? (
          <Text style={{ color: t.colors.inkMuted, textAlign: 'center', marginTop: t.space.sm }}>
            {invoice.error instanceof Error ? invoice.error.message : String(invoice.error)}
          </Text>
        ) : null}
      </CenteredNote>
    );
  }
  return (
    <CenteredNote>
      <ActivityIndicator color={t.colors.primary} />
    </CenteredNote>
  );
}
