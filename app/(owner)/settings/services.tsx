import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { createService, listServices, updateService } from '@/src/features/services/api';
import {
  SERVICE_KINDS,
  ServiceFormErrors,
  ServiceFormValues,
  centsToDollarsString,
  dollarsStringToCents,
  kindLabel,
  parseDurationMin,
  validateService,
} from '@/src/features/services/form';
import { Service, ServiceInput } from '@/src/features/services/types';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

function emptyValues(): ServiceFormValues {
  return { name: '', kind: null, durationMin: '30', basePrice: '0.00', extraPetPrice: '0.00' };
}

function valuesFrom(s: Service): ServiceFormValues {
  return {
    name: s.name,
    kind: s.kind,
    durationMin: String(s.duration_min),
    basePrice: centsToDollarsString(s.base_price_cents),
    extraPetPrice: centsToDollarsString(s.extra_pet_price_cents),
  };
}

function toInput(v: ServiceFormValues, requiresGps: boolean, active: boolean): ServiceInput {
  return {
    name: v.name.trim(),
    // validateService guarantees these parse before toInput is called.
    kind: v.kind!,
    duration_min: parseDurationMin(v.durationMin)!,
    base_price_cents: dollarsStringToCents(v.basePrice)!,
    extra_pet_price_cents: dollarsStringToCents(v.extraPetPrice)!,
    requires_gps: requiresGps,
    active,
  };
}

function Tag({ text, color }: { text: string; color: string }) {
  const t = useTheme();
  return (
    <View
      style={{ borderWidth: 1, borderColor: color, borderRadius: t.radius.pill,
        paddingHorizontal: t.space.sm, paddingVertical: t.space.xs / 2 }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

function ServiceEditor({
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: Service | null;
  saving: boolean;
  error: string | null;
  onSave: (input: ServiceInput) => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const [values, setValues] = useState<ServiceFormValues>(
    initial ? valuesFrom(initial) : emptyValues(),
  );
  const [requiresGps, setRequiresGps] = useState(initial?.requires_gps ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [errors, setErrors] = useState<ServiceFormErrors>({});
  const set = (patch: Partial<ServiceFormValues>) => setValues((v) => ({ ...v, ...patch }));

  return (
    <Card style={{ gap: t.space.md }}>
      <Text style={[t.type.title, { color: t.colors.ink }]}>
        {initial ? 'Edit service' : 'New service'}
      </Text>
      <TextField
        label="Name"
        value={values.name}
        onChangeText={(name) => set({ name })}
        error={errors.name}
      />
      <View style={{ gap: t.space.xs }}>
        <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Kind</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm }}>
          {SERVICE_KINDS.map((k) => (
            <Button
              key={k.value}
              title={k.label}
              variant={values.kind === k.value ? 'primary' : 'secondary'}
              onPress={() => set({ kind: k.value })}
            />
          ))}
        </View>
        {errors.kind ? (
          <Text style={{ color: t.colors.danger, fontSize: 12 }}>{errors.kind}</Text>
        ) : null}
      </View>
      <TextField
        label="Duration (minutes)"
        value={values.durationMin}
        onChangeText={(durationMin) => set({ durationMin })}
        keyboardType="number-pad"
        error={errors.durationMin}
      />
      <TextField
        label="Base price ($)"
        value={values.basePrice}
        onChangeText={(basePrice) => set({ basePrice })}
        keyboardType="decimal-pad"
        error={errors.basePrice}
      />
      <TextField
        label="Extra pet price ($)"
        value={values.extraPetPrice}
        onChangeText={(extraPetPrice) => set({ extraPetPrice })}
        keyboardType="decimal-pad"
        error={errors.extraPetPrice}
      />
      <Button
        title={requiresGps ? 'Requires GPS: on' : 'Requires GPS: off'}
        variant={requiresGps ? 'primary' : 'secondary'}
        onPress={() => setRequiresGps((v) => !v)}
      />
      <Button
        title={active ? 'Active' : 'Inactive'}
        variant={active ? 'primary' : 'secondary'}
        onPress={() => setActive((v) => !v)}
      />
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      <Button
        title={initial ? 'Save changes' : 'Create service'}
        loading={saving}
        onPress={() => {
          const next = validateService(values);
          setErrors(next);
          if (Object.keys(next).length === 0) onSave(toInput(values, requiresGps, active));
        }}
      />
      <Button title="Cancel" variant="ghost" onPress={onCancel} />
    </Card>
  );
}

export default function Services() {
  const t = useTheme();
  const qc = useQueryClient();
  const { businessId } = useActiveBusiness();
  const services = useQuery({
    queryKey: ['services', businessId],
    enabled: !!businessId,
    queryFn: () => listServices(businessId!),
  });
  useRefetchOnFocus(services.refetch);

  // Which row is open in the inline editor: a service id, 'new', or closed.
  const [editing, setEditing] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ServiceInput }) =>
      id ? updateService(businessId!, id, input) : createService(businessId!, input),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['services', businessId] });
    },
  });
  const saveError =
    save.error instanceof Error ? save.error.message : save.error ? String(save.error) : null;

  return (
    <Screen title="Services">
      {services.error ? (
        <Text style={{ color: t.colors.danger }}>
          {services.error instanceof Error ? services.error.message : String(services.error)}
        </Text>
      ) : null}
      {(services.data ?? []).map((s) =>
        editing === s.id ? (
          <ServiceEditor
            key={s.id}
            initial={s}
            saving={save.isPending}
            error={saveError}
            onSave={(input) => save.mutate({ id: s.id, input })}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Pressable
            key={s.id}
            onPress={() => {
              save.reset();
              setEditing(s.id);
            }}
          >
            <Card style={{ opacity: s.active ? 1 : 0.5 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'space-between', gap: t.space.sm }}
              >
                <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700', flexShrink: 1 }]}>
                  {s.name}
                </Text>
                <View style={{ flexDirection: 'row', gap: t.space.xs }}>
                  {s.requires_gps ? <Tag text="GPS" color={t.colors.primary} /> : null}
                  {!s.active ? <Tag text="Inactive" color={t.colors.inkMuted} /> : null}
                </View>
              </View>
              <Text style={{ color: t.colors.inkMuted }}>
                {kindLabel(s.kind)} · {s.duration_min} min
              </Text>
              <Text style={{ color: t.colors.inkMuted }}>
                ${centsToDollarsString(s.base_price_cents)}
                {s.extra_pet_price_cents > 0
                  ? ` · +$${centsToDollarsString(s.extra_pet_price_cents)}/extra pet`
                  : ''}
              </Text>
            </Card>
          </Pressable>
        ),
      )}
      {services.isSuccess && services.data.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>No services yet. Add your first below.</Text>
      ) : null}
      {editing === 'new' ? (
        <ServiceEditor
          initial={null}
          saving={save.isPending}
          error={saveError}
          onSave={(input) => save.mutate({ id: null, input })}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button
          title="Add service"
          onPress={() => {
            save.reset();
            setEditing('new');
          }}
        />
      )}
    </Screen>
  );
}
