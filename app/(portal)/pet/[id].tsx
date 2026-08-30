import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { usePortalScope } from '@/src/features/portal/hooks';
import {
  updatePortalPet,
  uploadPortalPetPhoto,
  type PortalPetDetail,
  type PortalPetPatch,
} from '@/src/features/portal/petsApi';
import { usePortalPet, usePortalPetPhoto } from '@/src/features/portal/petsHooks';
import { PortalScreen } from '@/src/features/portal/PortalScreen';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

/**
 * Portal pet editor (Plan 8 Task 6): EXACTLY the self-service columns are
 * editable — feeding notes, behavior/reactivity notes, vet info, photo. The
 * pets BEFORE UPDATE trigger pins that set server-side; the save payload here
 * is pinned by petsScreens/portalPetsQueries tests. meds_md and allergies are
 * client-READABLE (table-wide grant + row policy) but owner-curated
 * walker-safety notes, so they render read-only.
 */
export default function PortalPetEditor() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { link } = usePortalScope();
  const clientId = link?.client_id ?? null;
  const pet = usePortalPet(clientId, id ?? null);

  if (!pet.data) {
    return (
      <PortalScreen title="Pet">
        {pet.isError ? (
          <Card>
            <Text style={[t.type.body, { color: t.colors.danger }]}>
              This pet could not be loaded.
            </Text>
          </Card>
        ) : (
          <ActivityIndicator color={t.colors.primary} />
        )}
      </PortalScreen>
    );
  }

  return <Editor key={pet.data.id} pet={pet.data} />;
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function Editor({ pet }: { pet: PortalPetDetail }) {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();

  const [feeding, setFeeding] = useState(pet.feeding_md ?? '');
  const [reactivity, setReactivity] = useState(pet.reactivity_md ?? '');
  const [vetName, setVetName] = useState(pet.vet_name ?? '');
  const [vetPhone, setVetPhone] = useState(pet.vet_phone ?? '');
  const [vetAddress, setVetAddress] = useState(pet.vet_address ?? '');
  const [pickError, setPickError] = useState<string | null>(null);

  const photo = usePortalPetPhoto(pet.photo_path);

  function landed(updated: PortalPetDetail) {
    qc.setQueryData(['portal-pet', updated.client_id, updated.id], updated);
    void qc.invalidateQueries({ queryKey: ['portal-pet-cards', updated.client_id] });
  }

  const save = useMutation({
    mutationFn: (patch: PortalPetPatch) => updatePortalPet(pet.client_id, pet.id, patch),
    onSuccess: (updated) => {
      landed(updated);
      router.back();
    },
  });

  const upload = useMutation({
    mutationFn: (uri: string) => uploadPortalPetPhoto(pet, uri),
    onSuccess: (updated) => {
      landed(updated);
      // Same storage path — the signed url query must re-fetch the new bytes.
      void qc.invalidateQueries({ queryKey: ['portal-pet-photo', updated.photo_path] });
    },
  });

  async function pickPhoto() {
    setPickError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) upload.mutate(result.assets[0].uri);
    } catch (e) {
      setPickError(e instanceof Error ? e.message : String(e));
    }
  }

  const speciesLine = [pet.species, pet.breed].filter(Boolean).join(' · ');
  const saveError =
    save.error instanceof Error ? save.error.message : save.error ? String(save.error) : null;
  const uploadError =
    upload.error instanceof Error
      ? upload.error.message
      : upload.error
        ? String(upload.error)
        : null;

  return (
    <PortalScreen title={pet.name}>
      <Button title="Back" variant="ghost" onPress={() => router.back()} />

      {photo.data ? (
        <Image
          source={{ uri: photo.data }}
          // Capped card, 4:3 — matches the owner pet screen (full-width strips
          // butcher the photo on wide screens; 2026-08-30).
          style={{
            width: '100%',
            maxWidth: 440,
            aspectRatio: 4 / 3,
            alignSelf: 'center',
            borderRadius: t.radius.card,
          }}
          contentFit="cover"
          accessibilityLabel={`Photo of ${pet.name}`}
        />
      ) : null}
      <Button
        title={pet.photo_path ? 'Update photo' : 'Add a photo'}
        variant="secondary"
        loading={upload.isPending}
        onPress={() => void pickPhoto()}
      />
      {pickError || uploadError ? (
        <Text style={{ color: t.colors.danger }}>{pickError ?? uploadError}</Text>
      ) : null}

      <Card>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>About</Text>
        <Text style={{ color: t.colors.ink }}>{speciesLine || 'No details on file'}</Text>
        {pet.birthdate ? (
          <Text style={{ color: t.colors.ink }}>Born {pet.birthdate}</Text>
        ) : null}
        <Text style={{ color: t.colors.inkMuted, fontSize: 12, marginTop: t.space.xs }}>
          Name, breed, medications, and allergies are managed by your provider —
          ask them to update these.
        </Text>
      </Card>

      <Card>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Medications</Text>
        <Text style={{ color: pet.meds_md ? t.colors.ink : t.colors.inkMuted }}>
          {pet.meds_md ?? 'No medications'}
        </Text>
      </Card>
      <Card>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Allergies</Text>
        <Text style={{ color: pet.allergies ? t.colors.ink : t.colors.inkMuted }}>
          {pet.allergies ?? 'No known allergies'}
        </Text>
      </Card>

      <Card style={{ gap: t.space.sm }}>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Care notes</Text>
        <TextField
          label="Feeding notes"
          value={feeding}
          onChangeText={setFeeding}
          multiline
          placeholder="Meals, portions, treats…"
        />
        <TextField
          label="Behavior & reactivity notes"
          value={reactivity}
          onChangeText={setReactivity}
          multiline
          placeholder="Leash habits, triggers, other dogs…"
        />
      </Card>

      <Card style={{ gap: t.space.sm }}>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Vet</Text>
        <TextField label="Vet name" value={vetName} onChangeText={setVetName} />
        <TextField
          label="Vet phone"
          value={vetPhone}
          onChangeText={setVetPhone}
          keyboardType="phone-pad"
        />
        <TextField label="Vet address" value={vetAddress} onChangeText={setVetAddress} />
      </Card>

      {saveError ? <Text style={{ color: t.colors.danger }}>{saveError}</Text> : null}
      <Button
        title="Save changes"
        loading={save.isPending}
        onPress={() =>
          save.mutate({
            feeding_md: orNull(feeding),
            reactivity_md: orNull(reactivity),
            vet_name: orNull(vetName),
            vet_phone: orNull(vetPhone),
            vet_address: orNull(vetAddress),
          })
        }
      />
    </PortalScreen>
  );
}
