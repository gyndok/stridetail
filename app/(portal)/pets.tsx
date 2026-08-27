import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AccessCodesCard } from '@/src/features/portal/AccessCodesCard';
import { usePortalScope } from '@/src/features/portal/hooks';
import { usePortalPetCards, usePortalPetPhoto } from '@/src/features/portal/petsHooks';
import { PortalScreen } from '@/src/features/portal/PortalScreen';
import { Card } from '@/src/ui/Card';
import { useTheme } from '@/src/ui/theme';

import type { PortalPetCard } from '@/src/features/portal/petsApi';

/**
 * Portal pets tab (Plan 8 Task 6): the client's pets as cards routing to the
 * self-service editor, plus the access-codes card (the owner access screen
 * mirrored — component state only, wiped on blur).
 */
export default function PortalPets() {
  const t = useTheme();
  const { link } = usePortalScope();
  const clientId = link?.client_id ?? null;
  const pets = usePortalPetCards(clientId);

  return (
    <PortalScreen title="Pets">
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Your pets</Text>
      {pets.data?.length ? (
        pets.data.map((p) => <PetRow key={p.id} pet={p} />)
      ) : pets.isSuccess ? (
        <Card>
          <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
            No pets on file yet — your pet care provider adds pets to your account.
          </Text>
        </Card>
      ) : null}
      <AccessCodesCard clientId={clientId} />
    </PortalScreen>
  );
}

function PetRow({ pet }: { pet: PortalPetCard }) {
  const t = useTheme();
  const photo = usePortalPetPhoto(pet.photo_path);
  const speciesLine = [pet.species, pet.breed].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${pet.name}`}
      onPress={() => router.push(`/(portal)/pet/${pet.id}`)}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
        {photo.data ? (
          <Image
            source={{ uri: photo.data }}
            style={{ width: 56, height: 56, borderRadius: t.radius.card }}
            contentFit="cover"
            accessibilityLabel={`Photo of ${pet.name}`}
          />
        ) : (
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: t.radius.card,
              backgroundColor: t.colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 24 }}>🐾</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.colors.ink, fontWeight: '700' }}>{pet.name}</Text>
          <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
            {speciesLine || 'Tap to add care notes'}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}
