import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import {
  embeddedCount,
  firstPhone,
  isMeetGreetPending,
  listClients,
  petsCountLabel,
} from '@/src/features/clients/api';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

export default function Clients() {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();
  const [search, setSearch] = useState('');
  const term = search.trim();
  const clients = useQuery({
    queryKey: ['clients', businessId, term],
    enabled: !!businessId,
    placeholderData: keepPreviousData,
    queryFn: () => listClients(businessId!, term),
  });
  useRefetchOnFocus(clients.refetch);

  return (
    <Screen title="Clients">
      <TextField
        label="Search"
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {clients.error ? (
        <Text style={{ color: t.colors.danger }}>
          {clients.error instanceof Error ? clients.error.message : String(clients.error)}
        </Text>
      ) : null}
      {(clients.data ?? []).map((c) => {
        const phone = firstPhone(c.phones);
        return (
          // Task 5 adds app/(owner)/clients/[id].tsx; until then this push 404s.
          <Pressable key={c.id} onPress={() => router.push(`/clients/${c.id}` as Href)}>
            <Card>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  gap: t.space.sm }}
              >
                <Text style={[t.type.body, { color: t.colors.ink, flexShrink: 1 }]}>{c.name}</Text>
                {isMeetGreetPending(c) ? (
                  <View
                    style={{ borderWidth: 1, borderColor: t.colors.primary, borderRadius: t.radius.pill,
                      paddingHorizontal: t.space.sm, paddingVertical: t.space.xs / 2 }}
                  >
                    <Text style={{ color: t.colors.primary, fontSize: 12, fontWeight: '700' }}>
                      Meet & greet pending
                    </Text>
                  </View>
                ) : null}
              </View>
              {phone ? <Text style={{ color: t.colors.inkMuted }}>{phone}</Text> : null}
              <Text style={{ color: t.colors.inkMuted }}>{petsCountLabel(embeddedCount(c.pets))}</Text>
            </Card>
          </Pressable>
        );
      })}
      {clients.isSuccess && clients.data.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>
          {term ? 'No clients match your search.' : 'No clients yet. Add your first client below.'}
        </Text>
      ) : null}
      {/* Task 5 adds app/(owner)/clients/new.tsx; until then this push 404s. */}
      <Button title="Add client" onPress={() => router.push('/clients/new' as Href)} />
    </Screen>
  );
}
