import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { telUrl } from '@/src/features/clients/form';
import { getPet, petPhotoUrl, updatePet, uploadPetPhoto } from '@/src/features/pets/api';
import { DocumentsSection } from '@/src/features/pets/DocumentsSection';
import { petAge } from '@/src/features/pets/helpers';
import { PetForm } from '@/src/features/pets/PetForm';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function PetProfile() {
  const t = useTheme();
  const router = useRouter();
  const { petId } = useLocalSearchParams<{ id: string; petId: string }>();
  const { businessId } = useActiveBusiness();
  const [editing, setEditing] = useState(false);

  const pet = useQuery({
    queryKey: ['pet', businessId, petId],
    enabled: !!businessId && !!petId,
    queryFn: () => getPet(businessId!, petId!),
  });
  useRefetchOnFocus(pet.refetch);

  const p = pet.data;

  // Signed url (1h) for the private media bucket; re-signed per photo_path change.
  const photo = useQuery({
    queryKey: ['pet-photo', p?.photo_path],
    enabled: !!p?.photo_path,
    queryFn: () => petPhotoUrl(p!.photo_path!),
    staleTime: 55 * 60 * 1000,
  });

  if (editing && p) {
    return (
      <Screen title={p.name}>
        <PetForm
          initial={p}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (input, photoUri) => {
            await updatePet(businessId!, p.id, input);
            if (photoUri) await uploadPetPhoto(businessId!, p.id, photoUri);
            await pet.refetch();
            setEditing(false);
          }}
        />
      </Screen>
    );
  }

  const age = petAge(p?.birthdate ?? null);
  const speciesLine = p ? [p.species, p.breed].filter(Boolean).join(' · ') : null;

  return (
    <Screen title={p?.name ?? 'Pet'}>
      <Button title="Back" variant="ghost" onPress={() => router.back()} />
      {pet.error ? (
        <Text style={{ color: t.colors.danger }}>
          {pet.error instanceof Error ? pet.error.message : String(pet.error)}
        </Text>
      ) : null}
      {p ? (
        <>
          {photo.data ? (
            <Image
              source={{ uri: photo.data }}
              style={{ width: '100%', height: 220, borderRadius: t.radius.card }}
              contentFit="cover"
              accessibilityLabel={`Photo of ${p.name}`}
            />
          ) : null}
          <Card>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>About</Text>
            {speciesLine ? <Text style={{ color: t.colors.ink }}>{speciesLine}</Text> : null}
            {age ? (
              <Text style={{ color: t.colors.ink }}>
                {age} old{p.birthdate ? ` (born ${p.birthdate})` : ''}
              </Text>
            ) : (
              <Text style={{ color: t.colors.inkMuted }}>No birthdate on file</Text>
            )}
          </Card>
          {p.reactivity_md ? (
            <Card style={{ borderWidth: 2, borderColor: t.colors.warning }}>
              <Text style={[t.type.label, { color: t.colors.warning }]}>Reactivity</Text>
              <Text style={{ color: t.colors.ink }}>{p.reactivity_md}</Text>
            </Card>
          ) : null}
          <Card>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Feeding</Text>
            <Text style={{ color: p.feeding_md ? t.colors.ink : t.colors.inkMuted }}>
              {p.feeding_md ?? 'No feeding instructions'}
            </Text>
          </Card>
          <Card>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Medications</Text>
            <Text style={{ color: p.meds_md ? t.colors.ink : t.colors.inkMuted }}>
              {p.meds_md ?? 'No medications'}
            </Text>
          </Card>
          <Card>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Allergies</Text>
            <Text style={{ color: p.allergies ? t.colors.ink : t.colors.inkMuted }}>
              {p.allergies ?? 'No known allergies'}
            </Text>
          </Card>
          <Card>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Vet</Text>
            {p.vet_name ? <Text style={{ color: t.colors.ink }}>{p.vet_name}</Text> : null}
            {p.vet_phone ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(telUrl(p.vet_phone!))}
              >
                <Text style={[t.type.body, { color: t.colors.primary }]}>{p.vet_phone}</Text>
              </Pressable>
            ) : null}
            {p.vet_address ? <Text style={{ color: t.colors.ink }}>{p.vet_address}</Text> : null}
            {!p.vet_name && !p.vet_phone && !p.vet_address ? (
              <Text style={{ color: t.colors.inkMuted }}>No vet on file</Text>
            ) : null}
          </Card>
          <DocumentsSection businessId={businessId!} petId={p.id} />
          <Button title="Edit pet" onPress={() => setEditing(true)} />
        </>
      ) : null}
    </Screen>
  );
}
