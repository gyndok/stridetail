import { useState } from 'react';
import { Text } from 'react-native';

import { Button } from '@/src/ui/Button';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

import { geocodeAddress } from './geocode';
import { needsGeocode, parsePhones, phonesToText, validateClient, type ClientFormErrors } from './form';
import type { Client, ClientInput } from './types';

type Props = {
  /** Prefill for edit mode; omit for a new client. */
  initial?: Pick<Client, 'name' | 'phones' | 'email' | 'address' | 'lat' | 'lng' | 'notes_md'>;
  submitLabel: string;
  onSubmit: (input: ClientInput) => Promise<void>;
  onCancel?: () => void;
};

/**
 * Shared add/edit client form. On save the address is geocoded on-device
 * (expo-location) when present and new/changed; a failed geocode never blocks
 * the save — the client is stored with lat/lng null ("no map pin").
 */
export function ClientForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const t = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [phonesText, setPhonesText] = useState(phonesToText(initial?.phones));
  const [email, setEmail] = useState(initial?.email ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [notes, setNotes] = useState(initial?.notes_md ?? '');
  const [errors, setErrors] = useState<ClientFormErrors>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function save() {
    const nextErrors = validateClient({ name, email });
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.email) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const trimmedAddress = address.trim() || null;
      let lat = initial?.lat ?? null;
      let lng = initial?.lng ?? null;
      if (!trimmedAddress) {
        lat = null;
        lng = null;
      } else if (needsGeocode(trimmedAddress, initial)) {
        const geo = await geocodeAddress(trimmedAddress);
        lat = geo?.lat ?? null;
        lng = geo?.lng ?? null;
      }
      await onSubmit({
        name: name.trim(),
        phones: parsePhones(phonesText),
        email: email.trim() || null,
        address: trimmedAddress,
        lat,
        lng,
        notes_md: notes.trim() || null,
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Client name"
        error={errors.name}
      />
      <TextField
        label="Phones (comma-separated)"
        value={phonesText}
        onChangeText={setPhonesText}
        placeholder="713-555-0101, 832-555-0202"
        keyboardType="phone-pad"
        autoCorrect={false}
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="client@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        error={errors.email}
      />
      <TextField
        label="Address"
        value={address}
        onChangeText={setAddress}
        placeholder="Street, city, state"
        multiline
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />
      <TextField
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Household notes"
        multiline
        style={{ minHeight: 96, textAlignVertical: 'top' }}
      />
      {submitError ? <Text style={{ color: t.colors.danger }}>{submitError}</Text> : null}
      <Button title={submitLabel} onPress={() => void save()} loading={busy} />
      {onCancel ? <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} /> : null}
    </>
  );
}
