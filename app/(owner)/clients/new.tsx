import { useRouter, type Href } from 'expo-router';

import { useActiveBusiness } from '@/src/features/business/active';
import { createClient } from '@/src/features/clients/api';
import { ClientForm } from '@/src/features/clients/ClientForm';
import { Screen } from '@/src/ui/Screen';

export default function NewClient() {
  const router = useRouter();
  const { businessId } = useActiveBusiness();

  return (
    <Screen title="New client">
      <ClientForm
        submitLabel="Create client"
        onCancel={() => router.back()}
        onSubmit={async (input) => {
          if (!businessId) throw new Error('No active business');
          const created = await createClient(businessId, input);
          router.replace(`/clients/${created.id}` as Href);
        }}
      />
    </Screen>
  );
}
