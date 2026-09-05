import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Share, Text, View } from 'react-native';

import {
  getInvoice,
  recordPayment,
  removePayment,
  removeInvoiceItem,
  resendInvoiceEmail,
  sendInvoice,
  voidInvoice,
} from '@/src/features/billing/api';
import {
  formatCents,
  formatIsoDate,
  invoiceNumberLabel,
  methodLabel,
  PAYMENT_METHODS,
  statusChip,
  sumCents,
} from '@/src/features/billing/money';
import { invoiceLink } from '@/src/features/billing/newInvoice';
import { StatusBadge } from '@/src/features/billing/StatusBadge';
import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { invoiceSmsBody, smsUrl } from '@/src/features/report/deviceSms';
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
 * Invoice detail (Plan 5 Task 4): lines, totals, payments, and the status-
 * driven actions — Send (draft), Record payment (sent), Void (draft|sent),
 * Share link / device-SMS / Resend email (sent|paid with a live token).
 * Resend rides the Plan 6 Task 4 resend_invoice_email RPC, which re-queues
 * the invoice_ready email with the EXISTING token (send_invoice stays
 * drafts-only so nothing can rotate a live link).
 */

export default function InvoiceDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [error, setError] = useState<string | null>(null);
  // Alert.alert buttons no-op on web (team.tsx lesson) — the send/void/resend
  // confirms are inline cards, and post-action feedback is an inline notice.
  const [confirming, setConfirming] = useState<'send' | 'void' | 'resend' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Record-payment form (visible while status is sent).
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('venmo');
  const [amountText, setAmountText] = useState('');
  const [receivedText, setReceivedText] = useState(() => dateToYmd(new Date()));
  const [memoText, setMemoText] = useState('');
  const [tipText, setTipText] = useState('');

  const invoice = useQuery({
    queryKey: ['invoice', businessId, id],
    enabled: !!businessId && !!id,
    queryFn: () => getInvoice(businessId!, id!),
  });
  useRefetchOnFocus(invoice.refetch);

  const refresh = () => {
    setError(null);
    setConfirming(null);
    setNotice(null);
    void queryClient.invalidateQueries({ queryKey: ['invoice', businessId, id] });
    void queryClient.invalidateQueries({ queryKey: ['invoices', businessId] });
    void queryClient.invalidateQueries({ queryKey: ['deposits', businessId, 'held'] });
  };
  const fail = (e: unknown) => setError(errorText(e));

  const sendMut = useMutation({
    mutationFn: () => sendInvoice(id!),
    onSuccess: () => {
      refresh();
      // The refreshed screen shows Share link / Text the client below, so the
      // old post-send share prompt is now just a notice.
      setNotice('Invoice sent — the client gets the payment link by email.');
    },
    onError: fail,
  });
  const removeMut = useMutation({
    mutationFn: (itemId: string) => removeInvoiceItem(itemId),
    onSuccess: refresh,
    onError: fail,
  });
  const voidMut = useMutation({ mutationFn: () => voidInvoice(id!), onSuccess: refresh, onError: fail });
  const resendMut = useMutation({
    mutationFn: () => resendInvoiceEmail(id!),
    onSuccess: () => {
      setError(null);
      setConfirming(null);
      setNotice('Email queued — the client will get the invoice link again.');
    },
    onError: fail,
  });
  // Web-safe inline confirm (Alert buttons no-op on web — team.tsx lesson).
  const [confirmRemovePayId, setConfirmRemovePayId] = useState<string | null>(null);
  const removePayMut = useMutation({
    mutationFn: (paymentId: string) => removePayment(paymentId),
    onSuccess: () => {
      setConfirmRemovePayId(null);
      refresh();
    },
    onError: fail,
  });
  const payMut = useMutation({
    mutationFn: (args: { cents: number; tipCents: number }) =>
      recordPayment(id!, method, args.cents, receivedText, memoText.trim() || null, args.tipCents),
    onSuccess: () => {
      setPayOpen(false);
      setAmountText('');
      setMemoText('');
      setTipText('');
      refresh();
    },
    onError: fail,
  });

  const inv = invoice.data ?? null;

  if (!inv) {
    return (
      <Screen title="Invoice">
        <Button title="Back" variant="ghost" onPress={() => router.back()} />
        {invoice.error ? (
          <Text style={{ color: t.colors.danger }}>{errorText(invoice.error)}</Text>
        ) : (
          <Text style={{ color: t.colors.inkMuted }}>Loading…</Text>
        )}
      </Screen>
    );
  }

  const itemsCents = sumCents(inv.items);
  const paymentsCents = sumCents(inv.payments);
  const chip = statusChip(inv, { itemsCents, paymentsCents }, new Date());
  const editable = inv.status === 'draft' || inv.status === 'sent';
  const shareable = !!inv.public_token && !inv.revoked_at && inv.status !== 'void';
  const link = inv.public_token ? invoiceLink(inv.public_token) : null;
  const clientPhone = inv.client?.phones?.[0] ?? null;
  const businessName =
    memberships.data?.find((m) => m.business_id === businessId)?.business.name ??
    'Your pet care team';
  const items = [...inv.items].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );

  function submitPayment() {
    setError(null);
    const cents = dollarsStringToCents(amountText);
    if (cents === null || cents <= 0) return setError('Enter a payment amount like 25.00');
    const tipCents = tipText.trim() ? dollarsStringToCents(tipText) : 0;
    if (tipCents === null || tipCents < 0) return setError('Enter the tip like 5.00 (or leave it blank)');
    if (!receivedText) return setError('Pick the date the payment was received');
    payMut.mutate({ cents, tipCents });
  }

  const rowBetween = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: t.space.sm,
  };
  const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.sm };

  return (
    <Screen title={invoiceNumberLabel(inv.number)}>
      <Button title="Back" variant="ghost" onPress={() => router.back()} />

      <Card style={{ gap: t.space.xs }}>
        <View style={rowBetween}>
          <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
            {inv.client?.name ?? 'Client'}
          </Text>
          <StatusBadge label={chip.label} tone={chip.tone} />
        </View>
        <Text style={{ color: t.colors.inkMuted }}>Issued {formatIsoDate(inv.issued_on)}</Text>
        {inv.due_on ? (
          <Text style={{ color: t.colors.inkMuted }}>Due {formatIsoDate(inv.due_on)}</Text>
        ) : null}
        {inv.revoked_at ? (
          <Text style={{ color: t.colors.danger }}>Public link revoked.</Text>
        ) : null}
      </Card>

      <Text style={[t.type.title, { color: t.colors.ink }]}>Lines</Text>
      <Card style={{ gap: t.space.sm }}>
        {items.map((item) => (
          <View key={item.id} style={rowBetween}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: t.colors.ink }}>{item.description}</Text>
              {item.kind === 'manual' && editable ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => removeMut.mutate(item.id)}
                  disabled={removeMut.isPending}
                >
                  <Text style={{ color: t.colors.danger, fontSize: 12, fontWeight: '700' }}>
                    Remove
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Text
              style={{
                color: item.amount_cents < 0 ? t.colors.green : t.colors.ink,
                fontWeight: '700',
              }}
            >
              {formatCents(item.amount_cents)}
            </Text>
          </View>
        ))}
        {items.length === 0 ? (
          <Text style={{ color: t.colors.inkMuted }}>
            {inv.status === 'void' ? 'Lines were released when this invoice was voided.' : 'No lines.'}
          </Text>
        ) : null}
      </Card>

      <Card style={{ gap: t.space.xs }}>
        <View style={rowBetween}>
          <Text style={{ color: t.colors.inkMuted }}>Total</Text>
          <Text style={{ color: t.colors.ink }}>{formatCents(itemsCents)}</Text>
        </View>
        <View style={rowBetween}>
          <Text style={{ color: t.colors.inkMuted }}>Payments</Text>
          <Text style={{ color: t.colors.ink }}>{formatCents(-paymentsCents)}</Text>
        </View>
        <View style={rowBetween}>
          <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>Balance</Text>
          <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
            {formatCents(itemsCents - paymentsCents)}
          </Text>
        </View>
      </Card>

      {inv.payments.length > 0 ? (
        <>
          <Text style={[t.type.title, { color: t.colors.ink }]}>Payments</Text>
          <Card style={{ gap: t.space.sm }}>
            {inv.payments.map((p) => (
              <View key={p.id} style={rowBetween}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: t.colors.ink }}>
                    {methodLabel(p.method)} · {formatIsoDate(p.received_on)}
                  </Text>
                  {p.memo ? <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>{p.memo}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ color: t.colors.green, fontWeight: '700' }}>
                    {formatCents(p.amount_cents)}
                    {p.tip_cents > 0 ? ` + ${formatCents(p.tip_cents)} tip` : ''}
                  </Text>
                  {confirmRemovePayId === p.id ? (
                    <View style={{ flexDirection: 'row', gap: t.space.md }}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => removePayMut.mutate(p.id)}
                        hitSlop={8}
                      >
                        <Text style={{ color: t.colors.danger, fontSize: 12, fontWeight: '700' }}>
                          Really remove
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setConfirmRemovePayId(null)}
                        hitSlop={8}
                      >
                        <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>Keep</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove this payment"
                      onPress={() => setConfirmRemovePayId(p.id)}
                      hitSlop={8}
                    >
                      <Text style={{ color: t.colors.danger, fontSize: 12, fontWeight: '700' }}>
                        Remove
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      {notice ? <Text style={{ color: t.colors.green }}>{notice}</Text> : null}

      {inv.status === 'draft' && confirming !== 'send' ? (
        <Button title="Send invoice" onPress={() => setConfirming('send')} />
      ) : null}
      {inv.status === 'draft' && confirming === 'send' ? (
        <Card style={{ gap: t.space.sm }}>
          <Text style={{ color: t.colors.ink }}>
            Email the client a link to view and pay this invoice?
          </Text>
          <Button title="Send it" onPress={() => sendMut.mutate()} loading={sendMut.isPending} />
          <Button title="Cancel" variant="ghost" onPress={() => setConfirming(null)} />
        </Card>
      ) : null}

      {inv.status === 'sent' && !payOpen ? (
        <Button title="Record payment" onPress={() => setPayOpen(true)} />
      ) : null}
      {inv.status === 'sent' && payOpen ? (
        <Card style={{ gap: t.space.sm }}>
          <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Record payment</Text>
          <View style={chipRow}>
            {PAYMENT_METHODS.map((m) => (
              <Chip
                key={m.value}
                label={m.label}
                selected={method === m.value}
                onPress={() => setMethod(m.value)}
              />
            ))}
          </View>
          <TextField
            label="Amount toward invoice ($)"
            value={amountText}
            onChangeText={setAmountText}
            placeholder="25.00"
            keyboardType="numbers-and-punctuation"
          />
          <TextField
            label="Tip ($, optional — goes to the walker)"
            value={tipText}
            onChangeText={setTipText}
            placeholder="5.00"
            keyboardType="numbers-and-punctuation"
          />
          <DateField label="Received" value={receivedText} onChange={setReceivedText} />
          <TextField label="Memo (optional)" value={memoText} onChangeText={setMemoText} />
          <Button title="Save payment" onPress={submitPayment} loading={payMut.isPending} />
          <Button title="Close" variant="ghost" onPress={() => setPayOpen(false)} />
        </Card>
      ) : null}

      {shareable && link ? (
        <>
          {inv.status === 'sent' || inv.status === 'paid' ? (
            confirming === 'resend' ? (
              <Card style={{ gap: t.space.sm }}>
                <Text style={{ color: t.colors.ink }}>
                  Email the client the invoice link again? The link stays the same.
                </Text>
                <Button
                  title="Resend"
                  onPress={() => resendMut.mutate()}
                  loading={resendMut.isPending}
                />
                <Button title="Cancel" variant="ghost" onPress={() => setConfirming(null)} />
              </Card>
            ) : (
              <Button
                title="Resend email"
                variant="secondary"
                onPress={() => setConfirming('resend')}
              />
            )
          ) : null}
          <Button
            title="Share link"
            variant="secondary"
            onPress={() => void Share.share({ message: link })}
          />
          {clientPhone ? (
            <Button
              title="Text the client"
              variant="secondary"
              onPress={() =>
                void Linking.openURL(
                  smsUrl(clientPhone, invoiceSmsBody(businessName, invoiceNumberLabel(inv.number), link)),
                )
              }
            />
          ) : null}
        </>
      ) : null}

      {editable && confirming !== 'void' ? (
        <Button title="Void invoice" variant="ghost" onPress={() => setConfirming('void')} />
      ) : null}
      {editable && confirming === 'void' ? (
        <Card style={{ gap: t.space.sm }}>
          <Text style={{ color: t.colors.ink }}>
            Visits become invoiceable again, applied deposits return to held, and the public link
            stops working. This cannot be undone.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => voidMut.mutate()}
            disabled={voidMut.isPending}
            hitSlop={8}
            style={{ alignSelf: 'center', paddingVertical: t.space.sm }}
          >
            <Text style={{ color: t.colors.danger, fontWeight: '700' }}>
              {voidMut.isPending ? 'Voiding…' : 'Really void'}
            </Text>
          </Pressable>
          <Button title="Keep invoice" variant="ghost" onPress={() => setConfirming(null)} />
        </Card>
      ) : null}
    </Screen>
  );
}
