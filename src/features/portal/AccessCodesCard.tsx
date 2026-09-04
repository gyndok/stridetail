import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import type { ClientAccessCodes, ClientAccessInput } from '@/src/features/clients/access';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

import { hasClientAccessSelf, revealClientAccessSelf, setClientAccessSelf } from './accessApi';
import { errorText } from '@/src/lib/errorText';

const EMPTY_FORM: ClientAccessInput = {
  door: '',
  lockbox: '',
  gate: '',
  alarm: '',
  keyLocation: '',
  notes: '',
};

function formFromRevealed(codes: ClientAccessCodes | null): ClientAccessInput {
  return {
    door: codes?.door_code ?? '',
    lockbox: codes?.lockbox_code ?? '',
    gate: codes?.gate_code ?? '',
    alarm: codes?.alarm_code ?? '',
    keyLocation: codes?.key_location ?? '',
    notes: codes?.notes ?? '',
  };
}

/**
 * Client self-service access codes (Plan 8 Task 6) — the owner access screen
 * (app/(owner)/clients/[id]/access.tsx) mirrored onto the portal pets tab.
 * Spec §8: revealed values are NEVER cached — they live only in this
 * component's state and are wiped on blur/unmount. Only the "codes on file"
 * boolean goes through react-query.
 */
export function AccessCodesCard({ clientId }: { clientId: string | null }) {
  const t = useTheme();

  const hasCodes = useQuery({
    queryKey: ['portal-access-flag', clientId],
    enabled: !!clientId,
    queryFn: () => hasClientAccessSelf(clientId!),
  });

  // Revealed codes and the edit form exist ONLY here — no query cache, no storage.
  const [revealed, setRevealed] = useState<ClientAccessCodes | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ClientAccessInput>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wipe every plaintext value the moment the tab loses focus or unmounts.
  useFocusEffect(
    useCallback(
      () => () => {
        setRevealed(null);
        setEditing(false);
        setForm(EMPTY_FORM);
      },
      [],
    ),
  );

  async function reveal(): Promise<ClientAccessCodes | null> {
    const codes = await revealClientAccessSelf(clientId!);
    setRevealed(codes);
    return codes;
  }

  async function onReveal() {
    setBusy(true);
    setError(null);
    try {
      await reveal();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function onEdit() {
    setBusy(true);
    setError(null);
    try {
      // Prefill from the current values so saving never silently wipes fields
      // the client has not looked at. The reveal is audited like any other.
      const codes = hasCodes.data && !revealed ? await reveal() : revealed;
      setForm(formFromRevealed(codes));
      setEditing(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      await setClientAccessSelf(clientId!, form);
      setEditing(false);
      setForm(EMPTY_FORM);
      setRevealed(null);
      await hasCodes.refetch();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof ClientAccessInput, label: string) => (
    <TextField
      label={label}
      value={form[key]}
      onChangeText={(value) => setForm((f) => ({ ...f, [key]: value }))}
      autoCapitalize="none"
      autoCorrect={false}
    />
  );

  const revealedRow = (label: string, value: string | null) => (
    <View style={{ paddingVertical: t.space.xs }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{label}</Text>
      <Text style={{ color: value ? t.colors.ink : t.colors.inkMuted }}>{value ?? 'Not set'}</Text>
    </View>
  );

  if (!clientId) return null;

  return (
    <View style={{ gap: t.space.md }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Access codes</Text>
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      {editing ? (
        <Card>
          <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Edit access codes</Text>
          {field('door', 'Door code')}
          {field('lockbox', 'Lockbox code')}
          {field('gate', 'Gate code')}
          {field('alarm', 'Alarm code')}
          {field('keyLocation', 'Key location')}
          {field('notes', 'Notes')}
          <View style={{ gap: t.space.sm, marginTop: t.space.sm }}>
            <Button title="Save codes" loading={busy} onPress={() => void onSave()} />
            <Button
              title="Cancel"
              variant="ghost"
              disabled={busy}
              onPress={() => {
                setEditing(false);
                setForm(EMPTY_FORM);
              }}
            />
          </View>
        </Card>
      ) : (
        <>
          <Card>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Status</Text>
            <Text style={{ color: t.colors.ink }}>
              {hasCodes.isPending
                ? 'Checking…'
                : hasCodes.data
                  ? 'Codes on file'
                  : 'No codes on file yet'}
            </Text>
            <Text style={{ color: t.colors.inkMuted, fontSize: 12, marginTop: t.space.xs }}>
              Stored encrypted and shared only with your provider. Every view is
              logged in the audit trail.
            </Text>
          </Card>
          {revealed ? (
            <Card>
              {revealedRow('Door code', revealed.door_code)}
              {revealedRow('Lockbox code', revealed.lockbox_code)}
              {revealedRow('Gate code', revealed.gate_code)}
              {revealedRow('Alarm code', revealed.alarm_code)}
              {revealedRow('Key location', revealed.key_location)}
              {revealedRow('Notes', revealed.notes)}
            </Card>
          ) : null}
          {hasCodes.data && !revealed ? (
            <Button title="Reveal codes" loading={busy} onPress={() => void onReveal()} />
          ) : null}
          <Button
            title={hasCodes.data ? 'Edit codes' : 'Add codes'}
            variant={hasCodes.data ? 'secondary' : 'primary'}
            loading={busy}
            onPress={() => void onEdit()}
          />
        </>
      )}
    </View>
  );
}
