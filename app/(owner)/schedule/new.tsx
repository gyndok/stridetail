import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { listClients } from '@/src/features/clients/api';
import { listPets } from '@/src/features/pets/api';
import {
  fetchVaccineDocs,
  issueLabel,
  parseRequiredVaccines,
  vaccineIssues,
} from '@/src/features/pets/vaccines';
import {
  createSeries,
  createVisit,
  listActiveMembers,
  pickerContext,
  priceSnapshotCents,
  visitInstants,
} from '@/src/features/schedule/api';
import { Chip } from '@/src/features/schedule/Chip';
import { WalkerPicker } from '@/src/features/schedule/WalkerPicker';
import { localDayWindowUtc } from '@/src/lib/schedule/slotHints';
import { centsToDollarsString } from '@/src/features/services/form';
import { listServices } from '@/src/features/services/api';
import { WEEKDAY_LABELS } from '@/src/features/availability/api';
import { Button } from '@/src/ui/Button';
import { DateField } from '@/src/ui/DateField';
import { dateToYmd, roundToNextHour } from '@/src/ui/datetime';
import { Screen } from '@/src/ui/Screen';
import { TimeField } from '@/src/ui/TimeField';
import { useTheme } from '@/src/ui/theme';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today at local midnight — the pickers' minimum selectable date. */
const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export default function NewVisit() {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const tz = memberships.data?.find((m) => m.business_id === businessId)?.business.time_zone ?? null;

  const [clientId, setClientId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [petIds, setPetIds] = useState<string[]>([]);
  const [dateText, setDateText] = useState(() => dateToYmd(new Date()));
  const [timeText, setTimeText] = useState(() => roundToNextHour(new Date()));
  const [repeat, setRepeat] = useState<'off' | 'weekly'>('off');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [untilText, setUntilText] = useState('');
  const [walkerId, setWalkerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ['clients', businessId, ''],
    enabled: !!businessId,
    queryFn: () => listClients(businessId!),
  });
  const services = useQuery({
    queryKey: ['services', businessId],
    enabled: !!businessId,
    queryFn: () => listServices(businessId!),
  });
  const activeServices = (services.data ?? []).filter((s) => s.active);
  const pets = useQuery({
    queryKey: ['pets', businessId, clientId],
    enabled: !!businessId && !!clientId,
    queryFn: () => listPets(businessId!, clientId!),
  });
  const members = useQuery({
    queryKey: ['scheduleMembers', businessId],
    enabled: !!businessId,
    queryFn: () => listActiveMembers(businessId!),
  });

  // Required-vaccine warning (wish list #5): fetched per client (all their
  // pets' docs in one query), issues recomputed as pets are toggled. A warning
  // only — booking is never blocked.
  const requiredVaccines = parseRequiredVaccines(
    memberships.data?.find((m) => m.business_id === businessId)?.business.required_vaccines,
  );
  const clientPetIds = (pets.data ?? []).map((p) => p.id);
  const vaccineDocs = useQuery({
    queryKey: ['vaccineDocs', businessId, clientId, clientPetIds.length],
    enabled: !!businessId && clientPetIds.length > 0 && Object.keys(requiredVaccines).length > 0,
    queryFn: () => fetchVaccineDocs(businessId!, clientPetIds),
  });
  const selectedPets = (pets.data ?? []).filter((p) => petIds.includes(p.id));
  const issues = vaccineDocs.data
    ? vaccineIssues(selectedPets, vaccineDocs.data, requiredVaccines)
    : [];

  // Default the pet selection to ALL of the client's pets whenever they load
  // for a (newly) picked client.
  const petsDefaultedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!clientId || !pets.data) return;
    if (petsDefaultedFor.current === clientId) return;
    petsDefaultedFor.current = clientId;
    setPetIds(pets.data.map((p) => p.id));
  }, [clientId, pets.data]);

  const service = activeServices.find((s) => s.id === serviceId) ?? null;
  // No manual useMemo: the React Compiler memoizes, and its lint rejects a
  // useMemo over `service` (possibly-mutated dependency).
  const window = service && tz ? visitInstants(dateText, timeText, service.duration_min, tz) : null;

  // Fetched over the visit's whole LOCAL DAY (not just the window) so the
  // picker's tight-transfer flag sees the walker's neighbouring visits; day key
  // doubles as the cache key, so time edits within a day are pure recompute.
  const day = window && tz ? localDayWindowUtc(window.startUtc.toISOString(), tz) : null;
  const ctx = useQuery({
    queryKey: ['pickerCtx', businessId, day?.dayKey],
    enabled: !!businessId && !!day,
    queryFn: () => pickerContext(businessId!, day!.startUtc, day!.endUtc),
  });

  const slotClientRow = (clients.data ?? []).find((c) => c.id === clientId) ?? null;
  const slotClient = slotClientRow
    ? { id: slotClientRow.id, lat: slotClientRow.lat ?? null, lng: slotClientRow.lng ?? null }
    : null;

  const price = service && petIds.length > 0 ? priceSnapshotCents(service, petIds.length) : null;

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  async function create() {
    if (!businessId || !tz) return;
    setError(null);
    if (!clientId) return setError('Pick a client');
    if (!service) return setError('Pick a service');
    if (petIds.length === 0) return setError('Pick at least one pet');
    if (!window) return setError('Pick a date and time');
    if (repeat === 'weekly') {
      if (weekdays.length === 0) return setError('Pick at least one weekday to repeat on');
      if (untilText.trim() && !ISO_DATE.test(untilText.trim()))
        return setError('Enter the until date as YYYY-MM-DD');
      // visit_series.walker_id is NOT NULL — a series needs an assigned walker.
      if (!walkerId) return setError('A repeating series needs a walker assigned');
    }
    setBusy(true);
    try {
      if (repeat === 'weekly') {
        await createSeries({
          businessId,
          clientId,
          serviceId: service.id,
          walkerId: walkerId!,
          petIds,
          weekdays,
          localStart: timeText.trim(),
          startsOn: dateText.trim(),
          endsOn: untilText.trim() || null,
        });
      } else {
        await createVisit({
          businessId,
          clientId,
          serviceId: service.id,
          petIds,
          startUtc: window.startUtc,
          endUtc: window.endUtc,
          tz,
          priceCents: priceSnapshotCents(service, petIds.length),
          walkerId,
        });
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: t.space.sm };

  return (
    <Screen title="New visit">
      <Text style={[t.type.title, { color: t.colors.ink }]}>Client</Text>
      <View style={chipRow}>
        {(clients.data ?? []).map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={clientId === c.id}
            onPress={() => {
              setClientId(c.id);
              if (clientId !== c.id) {
                petsDefaultedFor.current = null;
                setPetIds([]);
              }
            }}
          />
        ))}
      </View>
      {clients.isSuccess && clients.data.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>Add a client first (Clients tab).</Text>
      ) : null}

      <Text style={[t.type.title, { color: t.colors.ink }]}>Service</Text>
      <View style={chipRow}>
        {activeServices.map((s) => (
          <Chip
            key={s.id}
            label={`${s.name} · ${s.duration_min}m`}
            selected={serviceId === s.id}
            onPress={() => setServiceId(s.id)}
          />
        ))}
      </View>
      {services.isSuccess && activeServices.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>No active services (Settings → Services).</Text>
      ) : null}

      {clientId ? (
        <>
          <Text style={[t.type.title, { color: t.colors.ink }]}>Pets</Text>
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
          {pets.isSuccess && pets.data.length === 0 ? (
            <Text style={{ color: t.colors.inkMuted }}>This client has no pets yet.</Text>
          ) : null}
          {issues.map((issue) => (
            <Text
              key={`${issue.petId}-${issue.type}`}
              style={{ color: t.colors.danger, fontWeight: '600' }}
            >
              ⚠ {issueLabel(issue)}
            </Text>
          ))}
        </>
      ) : null}

      <Text style={[t.type.title, { color: t.colors.ink }]}>When</Text>
      <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
        Times are in the business time zone{tz ? ` (${tz})` : ''}.
      </Text>
      <DateField label="Date" value={dateText} onChange={setDateText} minimumDate={startOfToday()} />
      <TimeField label="Time" value={timeText} onChange={setTimeText} />

      <Text style={[t.type.title, { color: t.colors.ink }]}>Repeat</Text>
      <View style={chipRow}>
        <Chip label="One-off" selected={repeat === 'off'} onPress={() => setRepeat('off')} />
        <Chip label="Weekly" selected={repeat === 'weekly'} onPress={() => setRepeat('weekly')} />
      </View>
      {repeat === 'weekly' ? (
        <>
          <View style={chipRow}>
            {WEEKDAY_LABELS.map((label, d) => (
              <Chip
                key={label}
                label={label.slice(0, 3)}
                selected={weekdays.includes(d)}
                onPress={() =>
                  setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
                }
              />
            ))}
          </View>
          <DateField
            label="Until (optional)"
            value={untilText}
            onChange={setUntilText}
            placeholder="No end date"
            minimumDate={startOfToday()}
            onClear={() => setUntilText('')}
          />
        </>
      ) : null}

      <Text style={[t.type.title, { color: t.colors.ink }]}>Walker</Text>
      <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
        {repeat === 'weekly'
          ? 'A repeating series needs a walker.'
          : 'Leave everyone unselected to keep the visit unassigned. Picking yourself assigns directly; picking a walker sends them an offer.'}
      </Text>
      <WalkerPicker
        members={members.data ?? []}
        ctx={ctx.data ?? null}
        window={window}
        tz={tz}
        selectedId={walkerId}
        onSelect={setWalkerId}
        slotClient={slotClient}
      />

      {price != null ? (
        <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>
          Price: ${centsToDollarsString(price)}
          {petIds.length > 1 ? ` (${petIds.length} pets)` : ''}
        </Text>
      ) : null}

      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      <Button title="Create" onPress={() => void create()} loading={busy} />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
