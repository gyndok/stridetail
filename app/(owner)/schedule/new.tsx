import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { listClients } from '@/src/features/clients/api';
import { listPets } from '@/src/features/pets/api';
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
import { centsToDollarsString } from '@/src/features/services/form';
import { listServices } from '@/src/features/services/api';
import { WEEKDAY_LABELS } from '@/src/features/availability/api';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function NewVisit() {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const tz = memberships.data?.find((m) => m.business_id === businessId)?.business.time_zone ?? null;

  const [clientId, setClientId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [petIds, setPetIds] = useState<string[]>([]);
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');
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

  const ctx = useQuery({
    queryKey: ['pickerCtx', businessId, window?.startUtc.toISOString(), window?.endUtc.toISOString()],
    enabled: !!businessId && !!window,
    queryFn: () => pickerContext(businessId!, window!.startUtc, window!.endUtc),
  });

  const price = service && petIds.length > 0 ? priceSnapshotCents(service, petIds.length) : null;

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  async function create() {
    if (!businessId || !tz) return;
    setError(null);
    if (!clientId) return setError('Pick a client');
    if (!service) return setError('Pick a service');
    if (petIds.length === 0) return setError('Pick at least one pet');
    if (!window) return setError('Enter the date as YYYY-MM-DD and time as HH:MM');
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
        </>
      ) : null}

      <Text style={[t.type.title, { color: t.colors.ink }]}>When</Text>
      <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
        Times are in the business time zone{tz ? ` (${tz})` : ''}.
      </Text>
      <View style={{ flexDirection: 'row', gap: t.space.sm }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Date"
            value={dateText}
            onChangeText={setDateText}
            placeholder="2026-08-31"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Time"
            value={timeText}
            onChangeText={setTimeText}
            placeholder="09:00"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>

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
          <TextField
            label="Until (optional)"
            value={untilText}
            onChangeText={setUntilText}
            placeholder="2026-12-31"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
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
