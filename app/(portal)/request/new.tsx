import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { formatCents } from '@/src/features/billing/money';
import { usePortalPets, usePortalScope } from '@/src/features/portal/hooks';
import { PortalScreen } from '@/src/features/portal/PortalScreen';
import {
  createBookingRequest,
  listPortalServices,
  requestWindow,
} from '@/src/features/portal/requestsApi';
import { Chip } from '@/src/features/schedule/Chip';
import { priceSnapshotCents } from '@/src/features/schedule/api';
import { Button } from '@/src/ui/Button';
import { DateField } from '@/src/ui/DateField';
import { dateToYmd, roundToNextHour } from '@/src/ui/datetime';
import { TextField } from '@/src/ui/TextField';
import { TimeField } from '@/src/ui/TimeField';
import { useTheme } from '@/src/ui/theme';

/** Today at local midnight — the date picker's minimum (schedule/new pattern). */
const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/** 'HH:MM' plus n hours, clamped to the same day's 23:59-style wrap. */
const plusHours = (hhmm: string, n: number) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return `${String((h + n) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Request-a-service form (Plan 8 Task 7). INSERTs a pending booking_request —
 * the Task-1 RLS insert policy is the real gate (own client/pets, active
 * service, pending only) and the DB trigger emails the owner. Prices are
 * shown: the client is the payer and Task 1 grants them the scoped business's
 * active services. Times are wall-clock in the BUSINESS zone (schedule/new
 * convention; DateField/TimeField carry the shared themeVariant fix).
 */
export default function NewRequest() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { link, business } = usePortalScope();
  const clientId = link?.client_id ?? null;
  const businessId = link?.business_id ?? null;
  const tz = business?.time_zone ?? null;

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [dateText, setDateText] = useState(() => dateToYmd(new Date()));
  const [startText, setStartText] = useState(() => roundToNextHour(new Date()));
  const [endText, setEndText] = useState(() => plusHours(roundToNextHour(new Date()), 2));
  const [petIds, setPetIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const services = useQuery({
    queryKey: ['portal-services', businessId],
    enabled: Boolean(businessId),
    queryFn: () => listPortalServices(businessId!),
  });
  const pets = usePortalPets(clientId);

  // Default the pet selection to ALL of the client's pets once they load
  // (schedule/new pattern; the scoped client never changes inside this form).
  const petsDefaulted = useRef(false);
  useEffect(() => {
    if (petsDefaulted.current || !pets.data) return;
    petsDefaulted.current = true;
    setPetIds(pets.data.map((p) => p.id));
  }, [pets.data]);

  const service = services.data?.find((s) => s.id === serviceId) ?? null;
  const price = service && petIds.length > 0 ? priceSnapshotCents(service, petIds.length) : null;

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  async function submit() {
    if (!clientId || !businessId || !tz) return;
    setError(null);
    if (!service) return setError('Pick a service');
    if (petIds.length === 0) return setError('Pick at least one pet');
    // Client-side mirror of the schema's window check — the same rule the DB
    // enforces, surfaced as a friendly message before the round-trip.
    const window = requestWindow(dateText, startText, endText, tz);
    if (!window) return setError('The time window must end after it starts');
    setBusy(true);
    try {
      await createBookingRequest({
        businessId,
        clientId,
        serviceId: service.id,
        petIds,
        startUtc: window.startUtc,
        endUtc: window.endUtc,
        note,
      });
      await qc.invalidateQueries({ queryKey: ['portal-booking-requests', clientId] });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.sm };

  return (
    <PortalScreen title="Request a service">
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Service</Text>
      <View style={chipRow}>
        {(services.data ?? []).map((s) => (
          <Chip
            key={s.id}
            label={`${s.name} · ${formatCents(s.base_price_cents)}`}
            selected={serviceId === s.id}
            onPress={() => setServiceId(s.id)}
          />
        ))}
      </View>
      {services.isSuccess && services.data.length === 0 ? (
        <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
          Your provider has no services to request yet.
        </Text>
      ) : null}

      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Pets</Text>
      <View style={chipRow}>
        {(pets.data ?? []).map((p) => (
          <Chip
            key={p.id}
            label={p.name}
            selected={petIds.includes(p.id)}
            onPress={() => setPetIds((cur) => toggle(cur, p.id))}
          />
        ))}
      </View>

      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>When works for you?</Text>
      <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
        Pick a time window — your provider confirms the exact time
        {tz ? ` (times in ${tz})` : ''}.
      </Text>
      <DateField label="Date" value={dateText} onChange={setDateText} minimumDate={startOfToday()} />
      <TimeField label="Earliest" value={startText} onChange={setStartText} />
      <TimeField label="Latest" value={endText} onChange={setEndText} />

      <TextField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="Anything your provider should know"
        multiline
      />

      {price != null ? (
        <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
          Price: {formatCents(price)}
          {petIds.length > 1 ? ` (${petIds.length} pets)` : ''}
        </Text>
      ) : null}

      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      <Button title="Send request" onPress={() => void submit()} loading={busy} />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </PortalScreen>
  );
}
