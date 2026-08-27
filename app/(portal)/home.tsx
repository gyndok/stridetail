import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { signOut } from '@/src/features/auth/session';
import { formatCents } from '@/src/features/billing/money';
import { StatusBadge } from '@/src/features/billing/StatusBadge';
import { useClaimOnEmptyLinks } from '@/src/features/portal/claim';
import {
  usePortalPets,
  usePortalScope,
  usePortalSentInvoices,
  useRecentReports,
  useUpcomingVisits,
} from '@/src/features/portal/hooks';
import {
  outstandingBalanceCents,
  petNamesLabel,
  portalVisitChip,
  visitWhenLabel,
} from '@/src/features/portal/home';
import { useClientLinks } from '@/src/features/portal/useClientLinks';
import { PortalScreen } from '@/src/features/portal/PortalScreen';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

/**
 * Portal home (Plan 8 Task 4): the client dashboard — upcoming visits, recent
 * report cards, outstanding balance — behind the tenant-branded shell. Still
 * doubles as the friendly "no account found" landing for an OTP user their
 * provider has not linked yet (Task 3 claim path unchanged).
 */
export default function PortalHome() {
  const t = useTheme();
  const qc = useQueryClient();
  const links = useClientLinks();
  const [busy, setBusy] = useState(false);
  // Task 3: an invited-but-unlinked OTP user gets claimed right here — the
  // ['client-links'] invalidation flips the view; everyone else keeps the
  // no-account message below.
  useClaimOnEmptyLinks();

  async function leave() {
    setBusy(true);
    await signOut();
    qc.clear();
  }

  if (!links.isSuccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.colors.surface }}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  if (!links.data.length) {
    return (
      <Screen>
        <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: t.space.md }}>
          <Text style={[t.type.hero, { color: t.colors.ink }]}>No account found</Text>
          <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
            We couldn&apos;t find a pet care account for this email yet. Ask your pet care
            provider to send you an invite, or sign in with the email address where you
            receive their messages.
          </Text>
          <Button title="Sign out" variant="ghost" onPress={leave} loading={busy} />
        </View>
      </Screen>
    );
  }

  return <Dashboard onSignOut={leave} busy={busy} />;
}

function Dashboard({ onSignOut, busy }: { onSignOut: () => void; busy: boolean }) {
  const t = useTheme();
  const { link, links, businesses, setLinkId } = usePortalScope();
  const clientId = link?.client_id ?? null;
  const visits = useUpcomingVisits(clientId);
  const reports = useRecentReports(clientId);
  const invoices = usePortalSentInvoices(clientId);
  const pets = usePortalPets(clientId);
  const balance = outstandingBalanceCents(invoices.data ?? []);
  const petList = pets.data ?? [];

  return (
    <PortalScreen>
      {links.length > 1 ? (
        // Multi-business v1 (DEVIATIONS): a plain switcher row — every portal
        // tab scopes to the selected link.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
          {links.map((l) => {
            const name = businesses.find((b) => b.id === l.business_id)?.name ?? 'Business';
            const active = l.id === link?.id;
            return (
              <Pressable
                key={l.id}
                accessibilityRole="button"
                accessibilityLabel={`Show ${name}`}
                onPress={() => void setLinkId(l.id)}
                style={{
                  borderWidth: 1,
                  borderColor: active ? t.colors.primary : t.colors.line,
                  backgroundColor: active ? t.colors.surfaceRaised : 'transparent',
                  borderRadius: t.radius.pill,
                  paddingHorizontal: t.space.md,
                  paddingVertical: t.space.xs,
                }}
              >
                <Text style={{ color: active ? t.colors.primary : t.colors.inkMuted, fontWeight: '700' }}>
                  {name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {balance > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View invoices"
          onPress={() => router.push('/(portal)/invoices')}
        >
          <Card style={{ borderWidth: 1, borderColor: t.colors.warning, gap: t.space.xs }}>
            <Text style={[t.type.label, { color: t.colors.warning }]}>Balance due</Text>
            <Text style={[t.type.title, { color: t.colors.ink }]}>{formatCents(balance)}</Text>
            <Text style={[t.type.body, { color: t.colors.inkMuted }]}>View your invoices →</Text>
          </Card>
        </Pressable>
      ) : null}

      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Upcoming visits</Text>
      {visits.data?.length ? (
        visits.data.map((v) => (
          <Card key={v.id} style={{ gap: t.space.xs }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: t.space.sm,
              }}
            >
              <Text style={{ color: t.colors.ink, fontWeight: '700', flexShrink: 1 }}>
                {visitWhenLabel(v.scheduled_start, v.business_tz)}
              </Text>
              <StatusBadge {...portalVisitChip(v.status)} />
            </View>
            <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
              {[v.service?.name ?? 'Visit', petNamesLabel(v.pet_ids, petList)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Card>
        ))
      ) : visits.isSuccess ? (
        <Card>
          <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
            No visits yet — your pet care provider will schedule your first visit.
          </Text>
        </Card>
      ) : null}

      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Recent report cards</Text>
      {reports.data?.length ? (
        reports.data.map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel="Open reports"
            // Task 5 builds the archive + detail; for now the row lands on the
            // Reports tab stub.
            onPress={() => router.push('/(portal)/reports')}
          >
            <Card style={{ gap: t.space.xs }}>
              <Text style={{ color: t.colors.ink, fontWeight: '700' }}>
                {visitWhenLabel(r.visit.scheduled_start, r.visit.business_tz)}
              </Text>
              <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
                {[r.visit.service?.name ?? 'Visit', petNamesLabel(r.visit.pet_ids, petList)]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Card>
          </Pressable>
        ))
      ) : reports.isSuccess ? (
        <Card>
          <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
            No report cards yet — they appear here after each visit.
          </Text>
        </Card>
      ) : null}

      <Button title="Sign out" variant="ghost" onPress={onSignOut} loading={busy} />
    </PortalScreen>
  );
}
