import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { getClient, isMeetGreetPending, updateClient } from '@/src/features/clients/api';
import { ClientForm } from '@/src/features/clients/ClientForm';
import { telUrl } from '@/src/features/clients/form';
import { listPets } from '@/src/features/pets/api';
import { petAge } from '@/src/features/pets/helpers';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function ClientDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { businessId } = useActiveBusiness();
  const [editing, setEditing] = useState(false);
  const [mgBusy, setMgBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const client = useQuery({
    queryKey: ['client', businessId, id],
    enabled: !!businessId && !!id,
    queryFn: () => getClient(businessId!, id!),
  });
  useRefetchOnFocus(client.refetch);

  const pets = useQuery({
    queryKey: ['pets', businessId, id],
    enabled: !!businessId && !!id,
    queryFn: () => listPets(businessId!, id!),
  });
  useRefetchOnFocus(pets.refetch);

  const c = client.data;

  async function markMeetGreetDone() {
    if (!businessId || !id) return;
    setMgBusy(true);
    setActionError(null);
    try {
      // Owner shortcut: Plan 3's visit flow will own meet & greet completion.
      await updateClient(businessId, id, { mg_completed_at: new Date().toISOString() });
      await client.refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setMgBusy(false);
    }
  }

  if (editing && c) {
    return (
      <Screen title={c.name}>
        <ClientForm
          initial={c}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await updateClient(businessId!, c.id, input);
            await client.refetch();
            setEditing(false);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen title={c?.name ?? 'Client'}>
      <Button title="Back" variant="ghost" onPress={() => router.back()} />
      {client.error ? (
        <Text style={{ color: t.colors.danger }}>
          {client.error instanceof Error ? client.error.message : String(client.error)}
        </Text>
      ) : null}
      {c ? (
        <>
          <Card>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Contact</Text>
            {c.phones.map((phone) => (
              <Pressable
                key={phone}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(telUrl(phone))}
              >
                <Text style={[t.type.body, { color: t.colors.primary }]}>{phone}</Text>
              </Pressable>
            ))}
            {c.phones.length === 0 ? (
              <Text style={{ color: t.colors.inkMuted }}>No phone on file</Text>
            ) : null}
            {c.email ? <Text style={{ color: t.colors.ink }}>{c.email}</Text> : null}
            {c.address ? (
              <>
                <Text style={{ color: t.colors.ink }}>{c.address}</Text>
                {c.lat === null ? (
                  <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
                    No map pin yet — save the address again to retry geocoding.
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={{ color: t.colors.inkMuted }}>No address on file</Text>
            )}
          </Card>
          {c.notes_md ? (
            <Card>
              <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Notes</Text>
              <Text style={{ color: t.colors.ink }}>{c.notes_md}</Text>
            </Card>
          ) : null}
          <Card>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Pets</Text>
            {(pets.data ?? []).map((pet) => {
              const age = petAge(pet.birthdate);
              const line = [pet.species, age].filter(Boolean).join(' · ');
              return (
                <Pressable
                  key={pet.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/clients/${id}/pets/${pet.id}` as Href)}
                  style={{
                    paddingVertical: t.space.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: t.colors.line,
                  }}
                >
                  <Text style={[t.type.body, { color: t.colors.ink }]}>{pet.name}</Text>
                  {line ? <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>{line}</Text> : null}
                </Pressable>
              );
            })}
            {pets.data?.length === 0 ? (
              <Text style={{ color: t.colors.inkMuted }}>No pets yet</Text>
            ) : null}
            <View style={{ marginTop: t.space.sm }}>
              <Button
                title="Add pet"
                variant="secondary"
                onPress={() => router.push(`/clients/${id}/pets/new` as Href)}
              />
            </View>
          </Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Access codes"
            onPress={() => router.push(`/clients/${id}/access` as Href)}
          >
            <Card>
              <Text style={[t.type.label, { color: t.colors.inkMuted }]}>🔒 Access codes</Text>
              <Text style={{ color: t.colors.ink }}>Door, lockbox, gate, and alarm codes</Text>
            </Card>
          </Pressable>
          {actionError ? <Text style={{ color: t.colors.danger }}>{actionError}</Text> : null}
          {isMeetGreetPending(c) ? (
            <Button
              title="Mark meet & greet done"
              variant="secondary"
              onPress={() => void markMeetGreetDone()}
              loading={mgBusy}
            />
          ) : null}
          <Button title="Edit client" onPress={() => setEditing(true)} />
        </>
      ) : null}
    </Screen>
  );
}
