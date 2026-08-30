import { useQueryClient } from '@tanstack/react-query';
import { getCalendars } from 'expo-localization';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { createBusiness } from '@/src/features/business/api';
import { BrandColorPicker } from '@/src/features/business/BrandColorPicker';
import { DEFAULT_BRAND_COLOR } from '@/src/features/business/branding';
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
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR);
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
      const id = await createBusiness({ name, timeZone: tz.trim(), brandColor });
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
      <Text style={[t.type.label, { color: t.colors.inkMuted, marginTop: t.space.sm }]}>
        Your brand color
      </Text>
      <BrandColorPicker value={brandColor} onSelect={setBrandColor} disabled={busy} />
      <Button title="Create business" onPress={submit} loading={busy} />
    </Screen>
  );
}
