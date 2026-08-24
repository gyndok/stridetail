import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { telUrl } from '@/src/features/clients/form';
import { petPhotoUrl } from '@/src/features/pets/api';
import { visitDayLabel, visitTimeRange } from '@/src/features/schedule/api';
import { appendVisitStart } from '@/src/features/visit/api';
import {
  canStart,
  fetchVisitDetail,
  mapsUrl,
  petInstructionRows,
  type VisitDetail,
  type VisitPetInfo,
} from '@/src/features/visit/detail';
import { startVisitTracking } from '@/src/lib/gps/controller';
import { kickSync } from '@/src/lib/offline/sync';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const STATUS_LABEL: Record<string, string> = {
  unassigned: 'Unassigned',
  offered: 'Offered',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * One pet's info, inline on the visit detail (walkers have no pet-profile
 * route — the owner one lives behind the owner-group role guard).
 */
function PetSection({ pet }: { pet: VisitPetInfo }) {
  const t = useTheme();
  const photo = useQuery({
    queryKey: ['pet-photo', pet.photo_path],
    enabled: !!pet.photo_path,
    queryFn: () => petPhotoUrl(pet.photo_path!),
    staleTime: 55 * 60 * 1000, // signed for 1 h; never serve an expired url
  });
  const rows = petInstructionRows(pet);
  const speciesLine = [pet.species, pet.breed].filter(Boolean).join(' · ');
  return (
    <Card style={{ gap: t.space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
        {photo.data ? (
          <Image
            source={{ uri: photo.data }}
            style={{ width: 56, height: 56, borderRadius: 28 }}
            contentFit="cover"
            accessibilityLabel={`Photo of ${pet.name}`}
          />
        ) : null}
        <View style={{ flexShrink: 1 }}>
          <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>{pet.name}</Text>
          {speciesLine ? <Text style={{ color: t.colors.inkMuted }}>{speciesLine}</Text> : null}
        </View>
      </View>
      {pet.reactivity_md ? (
        <View
          style={{
            borderWidth: 2,
            borderColor: t.colors.warning,
            borderRadius: t.radius.card,
            padding: t.space.md,
            gap: t.space.xs,
          }}
        >
          <Text style={[t.type.label, { color: t.colors.warning }]}>Reactivity</Text>
          <Text style={{ color: t.colors.ink }}>{pet.reactivity_md}</Text>
        </View>
      ) : null}
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 2 }}>
          <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{r.label}</Text>
          <Text style={{ color: t.colors.ink }}>{r.value}</Text>
        </View>
      ))}
      {rows.length === 0 && !pet.reactivity_md ? (
        <Text style={{ color: t.colors.inkMuted }}>No instructions on file</Text>
      ) : null}
    </Card>
  );
}

export default function VisitDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['visitDetail', id],
    enabled: !!id,
    queryFn: () => fetchVisitDetail(id!),
  });
  useRefetchOnFocus(detail.refetch);

  const d = detail.data;
  const gate = d ? canStart(d.visit.status) : null;

  const onStart = async () => {
    if (!d) return;
    setStarting(true);
    setError(null);
    try {
      // Outbox first (spec §8): the start lands locally and syncs in order.
      await appendVisitStart(d.visit.id);
      // Optimistic local status; the server catches up via the sync worker.
      queryClient.setQueryData<VisitDetail>(['visitDetail', id], (old) =>
        old ? { ...old, visit: { ...old.visit, status: 'in_progress' } } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ['myVisits'] });
      if (d.service?.requires_gps) {
        try {
          await startVisitTracking(d.visit.id);
        } catch (e) {
          // Permission denied: the visit is still started — only the route is lost.
          Alert.alert(
            'GPS not recording',
            `${errorText(e)}\n\nThe visit has still started; the route will not be recorded.`,
          );
        }
      }
      kickSync();
      router.replace(`/visit/${d.visit.id}/active` as Href);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen title={d?.client?.name ?? d?.visit.client?.name ?? 'Visit'}>
      <Button title="Back" variant="ghost" onPress={() => router.back()} />
      {detail.error ? (
        <Text style={{ color: t.colors.danger }}>{errorText(detail.error)}</Text>
      ) : null}
      {detail.isLoading ? <Text style={{ color: t.colors.inkMuted }}>Loading…</Text> : null}
      {d ? (
        <>
          <Card style={{ gap: t.space.xs }}>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Text style={{ color: t.colors.inkMuted, fontWeight: '700' }}>
                {visitDayLabel(d.visit)}
              </Text>
              <Text style={{ color: t.colors.ink, fontWeight: '600' }}>
                {visitTimeRange(d.visit)}
              </Text>
            </View>
            <Text style={{ color: t.colors.inkMuted }}>
              {d.service?.name ?? 'Service'}
              {d.service ? ` · ${d.service.duration_min} min` : ''}
              {` · ${STATUS_LABEL[d.visit.status] ?? d.visit.status}`}
            </Text>
          </Card>

          {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
          {d.visit.status === 'in_progress' ? (
            <Button
              title="Open active visit"
              onPress={() => router.replace(`/visit/${d.visit.id}/active` as Href)}
            />
          ) : (
            <Button
              title="Start visit"
              onPress={() => void onStart()}
              loading={starting}
              disabled={!gate?.ok || starting}
            />
          )}
          {gate && !gate.ok && d.visit.status !== 'in_progress' ? (
            <Text style={{ color: t.colors.inkMuted }}>{gate.reason}</Text>
          ) : null}

          {d.visit.owner_notes_md ? (
            <Card>
              <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Visit notes</Text>
              <Text style={{ color: t.colors.ink }}>{d.visit.owner_notes_md}</Text>
            </Card>
          ) : null}

          <Text style={[t.type.title, { color: t.colors.ink }]}>Pets</Text>
          {d.pets.length === 0 ? (
            <Text style={{ color: t.colors.inkMuted }}>No pets listed on this visit.</Text>
          ) : (
            d.pets.map((p) => <PetSection key={p.id} pet={p} />)
          )}

          <Text style={[t.type.title, { color: t.colors.ink }]}>Client</Text>
          <Card style={{ gap: t.space.sm }}>
            {d.client?.notes_md ? (
              <View style={{ gap: 2 }}>
                <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Notes</Text>
                <Text style={{ color: t.colors.ink }}>{d.client.notes_md}</Text>
              </View>
            ) : null}
            {d.client?.address ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(mapsUrl(d.client!.address!))}
              >
                <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Address</Text>
                <Text style={[t.type.body, { color: t.colors.primary }]}>{d.client.address}</Text>
              </Pressable>
            ) : null}
            {(d.client?.phones ?? []).map((phone) => (
              <Pressable
                key={phone}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(telUrl(phone))}
              >
                <Text style={[t.type.body, { color: t.colors.primary }]}>{phone}</Text>
              </Pressable>
            ))}
            {!d.client ? (
              <Text style={{ color: t.colors.inkMuted }}>Client details unavailable.</Text>
            ) : null}
          </Card>

          <Card style={{ opacity: 0.5 }}>
            <Text style={{ color: t.colors.ink }}>
              🔒 Access codes — available after you start
            </Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
