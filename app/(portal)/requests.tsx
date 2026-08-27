import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { StatusBadge } from '@/src/features/billing/StatusBadge';
import { visitWhenLabel } from '@/src/features/portal/home';
import { usePortalScope } from '@/src/features/portal/hooks';
import { PortalScreen } from '@/src/features/portal/PortalScreen';
import {
  listMyBookingRequests,
  requestStatusChip,
  requestWindowLabel,
} from '@/src/features/portal/requestsApi';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

/**
 * Portal requests tab (Plan 8 Task 7): the client's own booking requests with
 * status chips, and the entry to the request form. Approved rows show the
 * scheduled visit date (own-visits read); declined rows show the owner's
 * reason — booking_requests.decline_reason is THE deliberately client-facing
 * decline text (see requestsApi.ts docblock).
 */
export default function PortalRequests() {
  const t = useTheme();
  const { link, business } = usePortalScope();
  const clientId = link?.client_id ?? null;
  const tz = business?.time_zone ?? null;
  const requests = useQuery({
    queryKey: ['portal-booking-requests', clientId],
    enabled: Boolean(clientId),
    queryFn: () => listMyBookingRequests(clientId!),
  });

  return (
    <PortalScreen title="Visit requests">
      <Button title="Request a service" onPress={() => router.push('/(portal)/request/new')} />
      {requests.data?.length ? (
        requests.data.map((r) => (
          <Card key={r.id} style={{ gap: t.space.xs }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: t.space.sm,
              }}
            >
              <Text style={{ color: t.colors.ink, fontWeight: '700', flexShrink: 1 }}>
                {r.service?.name ?? 'Service'}
              </Text>
              <StatusBadge {...requestStatusChip(r.status)} />
            </View>
            {tz ? (
              <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
                {requestWindowLabel(r.window_start, r.window_end, tz)}
              </Text>
            ) : null}
            {r.status === 'approved' && r.visit ? (
              <Text style={[t.type.body, { color: t.colors.green, fontWeight: '700' }]}>
                Scheduled for {visitWhenLabel(r.visit.scheduled_start, r.visit.business_tz)}
              </Text>
            ) : null}
            {r.status === 'declined' && r.decline_reason ? (
              <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
                Reason: {r.decline_reason}
              </Text>
            ) : null}
            {r.note_md ? (
              <Text style={[t.type.body, { color: t.colors.inkMuted }]}>Note: {r.note_md}</Text>
            ) : null}
          </Card>
        ))
      ) : requests.isSuccess ? (
        <Card>
          <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
            No requests yet — ask for a walk or visit any time and your provider will confirm it.
          </Text>
        </Card>
      ) : null}
    </PortalScreen>
  );
}
