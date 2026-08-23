import { useQueryClient } from '@tanstack/react-query';
import { getCalendars } from 'expo-localization';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { createBusiness } from '@/src/features/business/api';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

/** Device time zone: native calendar first, then the JS runtime (web), never a fixed zone. */
function deviceTimeZone(): string {
  return getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
}

export default function CreateBusiness() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { setBusinessId } = useActiveBusiness();
  const [name, setName] = useState('');
  const [tz, setTz] = useState(deviceTimeZone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError('Give your business a name.');
      return;
    }
    if (!tz.trim()) {
      setError('Enter an IANA time zone, e.g. America/Chicago.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createBusiness({ name, timeZone: tz.trim() });
      await setBusinessId(id);
      await qc.invalidateQueries({ queryKey: ['memberships'] });
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Set up your business">
      <Text style={{ color: t.colors.inkMuted }}>Clients will see this name on texts and reports.</Text>
      <TextField label="Business name" value={name} onChangeText={setName} error={error ?? undefined} />
      <TextField label="Time zone" value={tz} onChangeText={setTz} autoCapitalize="none" autoCorrect={false} />
      <Button title="Create business" onPress={submit} loading={busy} />
    </Screen>
  );
}
