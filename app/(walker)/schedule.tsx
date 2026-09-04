import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  WEEKDAY_LABELS,
  addRule,
  addTimeOff,
  deleteRule,
  deleteTimeOff,
  formatLocalTime,
  formatTimeOffRange,
  groupRulesByWeekday,
  listMyAvailability,
  listMyTimeOff,
  validateTimeOffRange,
  validateTimeRange,
} from '@/src/features/availability/api';
import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';
import { errorText } from '@/src/lib/errorText';

/** Small ✕ affordance for deleting a row. */
function DeleteX({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: t.space.xs })}
    >
      <Text style={{ color: t.colors.danger, fontSize: 16, fontWeight: '700' }}>✕</Text>
    </Pressable>
  );
}

export default function Schedule() {
  const t = useTheme();
  const queryClient = useQueryClient();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  // Time-off wall times are interpreted in the business tz (never a hardcoded
  // zone); availability rules are plain local times — no conversion there.
  const tz = memberships.data?.find((m) => m.business_id === businessId)?.business.time_zone;

  const availability = useQuery({
    queryKey: ['availability', businessId],
    enabled: !!businessId,
    queryFn: () => listMyAvailability(businessId!),
  });
  const timeOff = useQuery({
    queryKey: ['timeOff', businessId],
    enabled: !!businessId,
    queryFn: () => listMyTimeOff(businessId!),
  });
  useRefetchOnFocus(availability.refetch);
  useRefetchOnFocus(timeOff.refetch);

  // Per-day add form (one open at a time).
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [dayError, setDayError] = useState<string | null>(null);

  // Time-off add form.
  const [offStart, setOffStart] = useState('');
  const [offEnd, setOffEnd] = useState('');
  const [offReason, setOffReason] = useState('');
  const [offError, setOffError] = useState<string | null>(null);

  const addRuleMut = useMutation({
    mutationFn: (input: { weekday: number; start: string; end: string }) =>
      addRule(businessId!, input.weekday, input.start, input.end),
    onSuccess: () => {
      setOpenDay(null);
      setStartText('');
      setEndText('');
      setDayError(null);
      void queryClient.invalidateQueries({ queryKey: ['availability', businessId] });
    },
    onError: (e) => setDayError(errorText(e)),
  });
  const deleteRuleMut = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['availability', businessId] }),
  });
  const addTimeOffMut = useMutation({
    mutationFn: (input: { startsAt: Date; endsAt: Date; reason: string }) =>
      addTimeOff(businessId!, input.startsAt, input.endsAt, input.reason),
    onSuccess: () => {
      setOffStart('');
      setOffEnd('');
      setOffReason('');
      setOffError(null);
      void queryClient.invalidateQueries({ queryKey: ['timeOff', businessId] });
    },
    onError: (e) => setOffError(errorText(e)),
  });
  const deleteTimeOffMut = useMutation({
    mutationFn: deleteTimeOff,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['timeOff', businessId] }),
  });

  const openAddFor = (weekday: number) => {
    setOpenDay(weekday);
    setStartText('');
    setEndText('');
    setDayError(null);
  };
  const saveRule = (weekday: number) => {
    const range = validateTimeRange(startText, endText);
    if (!range.ok) {
      setDayError(range.error);
      return;
    }
    addRuleMut.mutate({ weekday, start: range.start, end: range.end });
  };
  const saveTimeOff = () => {
    if (!tz) {
      setOffError('Business time zone is still loading — try again in a moment');
      return;
    }
    const range = validateTimeOffRange(offStart, offEnd, tz);
    if (!range.ok) {
      setOffError(range.error);
      return;
    }
    addTimeOffMut.mutate({ startsAt: range.startsAt, endsAt: range.endsAt, reason: offReason });
  };

  const grouped = groupRulesByWeekday(availability.data ?? []);
  const listError = availability.error ?? timeOff.error ?? deleteRuleMut.error ?? deleteTimeOffMut.error;

  return (
    <Screen title="Schedule">
      {listError ? <Text style={{ color: t.colors.danger }}>{errorText(listError)}</Text> : null}

      <Text style={[t.type.title, { color: t.colors.ink }]}>Weekly availability</Text>
      <Text style={{ color: t.colors.inkMuted }}>
        Local times, same-day ranges only. Ranges cannot cross midnight.
      </Text>
      {WEEKDAY_LABELS.map((label, weekday) => {
        const rules = grouped[weekday] ?? [];
        const adding = openDay === weekday;
        return (
          <Card key={label} style={{ gap: t.space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>{label}</Text>
              {!adding ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openAddFor(weekday)}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <Text style={{ color: t.colors.primary, fontWeight: '800' }}>Add</Text>
                </Pressable>
              ) : null}
            </View>
            {rules.length === 0 && !adding ? (
              <Text style={{ color: t.colors.inkMuted }}>Unavailable</Text>
            ) : null}
            {rules.map((r) => (
              <View
                key={r.id}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text style={{ color: t.colors.ink }}>
                  {formatLocalTime(r.start_local)} – {formatLocalTime(r.end_local)}
                </Text>
                <DeleteX
                  label={`Delete ${label} ${formatLocalTime(r.start_local)} range`}
                  onPress={() => deleteRuleMut.mutate(r.id)}
                />
              </View>
            ))}
            {adding ? (
              <View style={{ gap: t.space.sm }}>
                <View style={{ flexDirection: 'row', gap: t.space.sm }}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="Start"
                      value={startText}
                      onChangeText={setStartText}
                      placeholder="09:00"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="End"
                      value={endText}
                      onChangeText={setEndText}
                      placeholder="17:00"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </View>
                {dayError ? <Text style={{ color: t.colors.danger, fontSize: 12 }}>{dayError}</Text> : null}
                <View style={{ flexDirection: 'row', gap: t.space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Save"
                      onPress={() => saveRule(weekday)}
                      loading={addRuleMut.isPending}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Cancel" variant="ghost" onPress={() => setOpenDay(null)} />
                  </View>
                </View>
              </View>
            ) : null}
          </Card>
        );
      })}

      <Text style={[t.type.title, { color: t.colors.ink, marginTop: t.space.md }]}>Time off</Text>
      {timeOff.isSuccess && timeOff.data.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>No time off scheduled.</Text>
      ) : null}
      {(timeOff.data ?? []).map((o) => (
        <Card key={o.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: t.colors.ink }}>
                {tz ? formatTimeOffRange(o.starts_at, o.ends_at, tz) : `${o.starts_at} – ${o.ends_at}`}
              </Text>
              {o.reason ? <Text style={{ color: t.colors.inkMuted }}>{o.reason}</Text> : null}
            </View>
            <DeleteX label="Delete time off" onPress={() => deleteTimeOffMut.mutate(o.id)} />
          </View>
        </Card>
      ))}
      <Card style={{ gap: t.space.sm }}>
        <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700' }]}>Add time off</Text>
        <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
          Times are in the business time zone{tz ? ` (${tz})` : ''}.
        </Text>
        <TextField
          label="Starts"
          value={offStart}
          onChangeText={setOffStart}
          placeholder="2026-08-24 09:00"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        <TextField
          label="Ends"
          value={offEnd}
          onChangeText={setOffEnd}
          placeholder="2026-08-25 17:00"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        <TextField
          label="Reason (optional)"
          value={offReason}
          onChangeText={setOffReason}
          placeholder="Vacation"
        />
        {offError ? <Text style={{ color: t.colors.danger, fontSize: 12 }}>{offError}</Text> : null}
        <Button title="Add time off" onPress={saveTimeOff} loading={addTimeOffMut.isPending} />
      </Card>
    </Screen>
  );
}
