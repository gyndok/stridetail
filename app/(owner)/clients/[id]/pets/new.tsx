import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { useActiveBusiness } from '@/src/features/business/active';
import { createPet, uploadPetPhoto } from '@/src/features/pets/api';
import { PetForm } from '@/src/features/pets/PetForm';
import { Screen } from '@/src/ui/Screen';

export default function NewPet() {
  const router = useRouter();
  const { id: clientId } = useLocalSearchParams<{ id: string }>();
  const { businessId } = useActiveBusiness();

  return (
    <Screen title="New pet">
      <PetForm
        submitLabel="Create pet"
        onCancel={() => router.back()}
        onSubmit={async (input, photoUri) => {
          if (!businessId || !clientId) throw new Error('No active business');
          const created = await createPet(businessId, clientId, input);
          // Upload after create so the storage path can carry the pet id.
          if (photoUri) await uploadPetPhoto(businessId, created.id, photoUri);
          router.replace(`/clients/${clientId}/pets/${created.id}` as Href);
        }}
      />
    </Screen>
  );
}
