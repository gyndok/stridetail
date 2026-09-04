import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/src/ui/Button';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

import { birthdateFromAgeInput, parseDateOnly, petAge, validatePet, type PetFormErrors } from './helpers';
import type { Pet, PetInput } from './types';

type Props = {
  /** Prefill for edit mode; omit for a new pet. */
  initial?: Omit<Pet, 'id' | 'client_id' | 'business_id' | 'created_at' | 'updated_at'>;
  submitLabel: string;
  /**
   * photoUri is the locally picked image (file uri) or null when unchanged;
   * the caller uploads it after create/update so new pets have an id first.
   */
  onSubmit: (input: PetInput, photoUri: string | null) => Promise<void>;
  onCancel?: () => void;
};

/** Shared add/edit pet form (Plan 2 Task 6). */
export function PetForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const t = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [species, setSpecies] = useState(initial?.species ?? '');
  const [breed, setBreed] = useState(initial?.breed ?? '');
  // Age-first entry (round 3): show the CURRENT age derived from the stored
  // birthdate; only recompute the birthdate when the walker actually edits the
  // field — otherwise every save would silently shift an approximate birthdate.
  const initialAge = initial?.birthdate ? (petAge(initial.birthdate) ?? initial.birthdate) : '';
  const [ageText, setAgeText] = useState(initialAge);
  // Round 5 (first outside-tester feedback): sex + spayed/neutered + last heat.
  const [sex, setSex] = useState<string | null>(initial?.sex ?? null);
  const [fixed, setFixed] = useState<boolean | null>(initial?.fixed ?? null);
  const [lastHeat, setLastHeat] = useState(initial?.last_heat ?? '');
  const [lastHeatError, setLastHeatError] = useState<string | null>(null);
  const [feeding, setFeeding] = useState(initial?.feeding_md ?? '');
  const [meds, setMeds] = useState(initial?.meds_md ?? '');
  const [allergies, setAllergies] = useState(initial?.allergies ?? '');
  const [reactivity, setReactivity] = useState(initial?.reactivity_md ?? '');
  const [vetName, setVetName] = useState(initial?.vet_name ?? '');
  const [vetPhone, setVetPhone] = useState(initial?.vet_phone ?? '');
  const [vetAddress, setVetAddress] = useState(initial?.vet_address ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<PetFormErrors>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function pickPhoto(source: 'camera' | 'library') {
    setSubmitError(null);
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setSubmitError('Camera permission is needed to take a photo.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }

  async function save() {
    const heatText = lastHeat.trim();
    const heatValid = !heatText || parseDateOnly(heatText) !== null;
    setLastHeatError(heatValid ? null : 'Use YYYY-MM-DD');
    const nextErrors = validatePet({ name, species, age: ageText });
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.species || nextErrors.age || !heatValid) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await onSubmit(
        {
          name: name.trim(),
          species: species.trim(),
          breed: breed.trim() || null,
          birthdate:
            ageText.trim() === initialAge.trim()
              ? (initial?.birthdate ?? null)
              : ageText.trim()
                ? birthdateFromAgeInput(ageText)
                : null,
          sex,
          fixed,
          last_heat: sex === 'female' && fixed === false && heatText ? heatText : null,
          feeding_md: feeding.trim() || null,
          meds_md: meds.trim() || null,
          allergies: allergies.trim() || null,
          reactivity_md: reactivity.trim() || null,
          vet_name: vetName.trim() || null,
          vet_phone: vetPhone.trim() || null,
          vet_address: vetAddress.trim() || null,
        },
        photoUri,
      );
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={{ width: 120, height: 120, borderRadius: t.radius.card, alignSelf: 'center' }}
          contentFit="cover"
          accessibilityLabel="Pet photo preview"
        />
      ) : null}
      <View style={{ flexDirection: 'row', gap: t.space.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Take photo" variant="secondary" onPress={() => void pickPhoto('camera')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Choose photo"
            variant="secondary"
            onPress={() => void pickPhoto('library')}
          />
        </View>
      </View>
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Pet name"
        error={errors.name}
      />
      <TextField
        label="Species"
        value={species}
        onChangeText={setSpecies}
        placeholder="Dog, cat, …"
        error={errors.species}
      />
      <TextField label="Breed" value={breed} onChangeText={setBreed} placeholder="Breed" />
      <TextField
        label="Age (or exact birthday)"
        value={ageText}
        onChangeText={setAgeText}
        placeholder="3, 8 mo, or 2023-03-10"
        autoCorrect={false}
        autoCapitalize="none"
        error={errors.age}
      />
      <ChipRow
        label="Sex"
        options={[
          { value: null, label: 'Not set' },
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
        ]}
        selected={sex}
        onSelect={(v) => setSex(v as string | null)}
      />
      <ChipRow
        label="Spayed / neutered"
        options={[
          { value: null, label: 'Not sure' },
          { value: true, label: 'Yes' },
          { value: false, label: 'No' },
        ]}
        selected={fixed}
        onSelect={(v) => setFixed(v as boolean | null)}
      />
      {sex === 'female' && fixed === false ? (
        <TextField
          label="Last heat (optional, YYYY-MM-DD)"
          value={lastHeat}
          onChangeText={setLastHeat}
          placeholder="2026-08-15"
          autoCorrect={false}
          autoCapitalize="none"
          error={lastHeatError ?? undefined}
        />
      ) : null}
      <TextField
        label="Feeding"
        value={feeding}
        onChangeText={setFeeding}
        placeholder="Feeding instructions"
        multiline
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />
      <TextField
        label="Medications"
        value={meds}
        onChangeText={setMeds}
        placeholder="Medications and dosing"
        multiline
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />
      <TextField
        label="Allergies"
        value={allergies}
        onChangeText={setAllergies}
        placeholder="Known allergies"
      />
      <TextField
        label="Reactivity"
        value={reactivity}
        onChangeText={setReactivity}
        placeholder="Triggers, handling notes"
        multiline
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />
      <TextField
        label="Vet name"
        value={vetName}
        onChangeText={setVetName}
        placeholder="Clinic or vet name"
      />
      <TextField
        label="Vet phone"
        value={vetPhone}
        onChangeText={setVetPhone}
        placeholder="713-555-0101"
        keyboardType="phone-pad"
        autoCorrect={false}
      />
      <TextField
        label="Vet address"
        value={vetAddress}
        onChangeText={setVetAddress}
        placeholder="Street, city, state"
        multiline
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />
      {submitError ? <Text style={{ color: t.colors.danger }}>{submitError}</Text> : null}
      <Button title={submitLabel} onPress={() => void save()} loading={busy} />
      {onCancel ? <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} /> : null}
    </>
  );
}

/** Small labeled chip row (round 5) — same pill pattern as the client form. */
function ChipRow<T extends string | boolean | null>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.xs }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
        {options.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <Pressable
              key={String(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(opt.value)}
              style={{
                paddingVertical: t.space.sm,
                paddingHorizontal: t.space.md,
                borderRadius: t.radius.pill,
                borderWidth: 1,
                borderColor: isSelected ? t.colors.primary : t.colors.line,
                backgroundColor: isSelected ? t.colors.primary : 'transparent',
              }}
            >
              <Text style={{ color: isSelected ? t.colors.onPrimary : t.colors.ink }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
