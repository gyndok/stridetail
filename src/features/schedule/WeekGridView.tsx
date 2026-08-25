import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { canTransition } from '@/src/lib/schedule/machine';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

import {
  listActiveMembers,
  listVisits,
  memberName,
  offerVisit,
  pickerContext,
  rescheduleVisit,
  visitInstants,
  visitTimeRange,
  type Visit,
} from './api';
import { WalkerPicker } from './WalkerPicker';
import { gridPosition, visitsByDay, weekDays, weekRange } from './weekGrid';

// Desktop week grid (Plan 4 Task 8). Web >= 900 px only — the mobile list is
// untouched. All day/column math happens in the BUSINESS tz via the pure
// helpers in weekGrid.ts.

const DAY_MS = 86_400_000;
/** Hour gutter range: 06:00–21:00 local. */
const GRID_START_MIN = 6 * 60;
const GRID_END_MIN = 21 * 60;
const PX_PER_MIN = 1;
const GRID_HEIGHT = (GRID_END_MIN - GRID_START_MIN) * PX_PER_MIN;
const COL_WIDTH = 150;
const GUTTER_WIDTH = 52;
const HEADER_HEIGHT = 34;
const MIN_BLOCK_PX = 22;

/** Statuses a visit may be rescheduled from (moving a running/done visit is meaningless). */
const RESCHEDULABLE = new Set(['unassigned', 'offered', 'accepted']);

function blockColors(t: ReturnType<typeof useTheme>, status: Visit['status']) {
  if (status === 'unassigned') {
    return { backgroundColor: t.colors.surfaceRaised, borderColor: t.colors.warning, text: t.colors.ink };
  }
  if (status === 'offered') {
    return { backgroundColor: t.colors.surface, borderColor: t.colors.line, text: t.colors.inkMuted };
  }
  // accepted / in_progress / completed: the covered states (Round 0 green).
  return { backgroundColor: t.colors.greenSoft, borderColor: t.colors.green, text: t.colors.ink };
}

/**
 * Inline quick panel under the grid (judging step 6): offer/reassign via the
 * walker picker + a date/time reschedule — the first UI over the Plan-3
 * `rescheduleVisit` api. "Open details" reaches the full /schedule/[id] route.
 */
function QuickPanel({
  businessId,
  visit,
  walkerName,
  tz,
  onClose,
}: {
  businessId: string;
  visit: Visit;
  walkerName: string | null;
  tz: string;
  onClose: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pickedWalker, setPickedWalker] = useState<string | null>(null);
  const [date, setDate] = useState(() =>
    formatInTimeZone(new Date(visit.scheduled_start), tz, 'yyyy-MM-dd'),
  );
  const [time, setTime] = useState(() =>
    formatInTimeZone(new Date(visit.scheduled_start), tz, 'HH:mm'),
  );
  const [error, setError] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ['scheduleMembers', businessId],
    queryFn: () => listActiveMembers(businessId),
  });
  const ctx = useQuery({
    queryKey: ['pickerCtx', businessId, visit.scheduled_start, visit.scheduled_end],
    queryFn: () =>
      pickerContext(businessId, new Date(visit.scheduled_start), new Date(visit.scheduled_end)),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['visits', businessId] });
    void queryClient.invalidateQueries({ queryKey: ['visit', businessId, visit.id] });
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const offerMut = useMutation({
    mutationFn: (walkerId: string) => offerVisit(visit.id, walkerId),
    onSuccess: () => {
      setError(null);
      invalidate();
      onClose();
    },
    onError: fail,
  });
  const rescheduleMut = useMutation({
    mutationFn: (window: { startUtc: Date; endUtc: Date }) =>
      rescheduleVisit(visit.id, window.startUtc, window.endUtc),
    onSuccess: () => {
      setError(null);
      invalidate();
      onClose();
    },
    onError: fail,
  });

  // Keep the visit's real scheduled length when moving it.
  const durationMin = Math.round(
    (new Date(visit.scheduled_end).getTime() - new Date(visit.scheduled_start).getTime()) / 60_000,
  );
  const submitReschedule = () => {
    const instants = visitInstants(date, time, durationMin, tz);
    if (!instants) {
      setError('Enter the new start as YYYY-MM-DD and HH:MM');
      return;
    }
    rescheduleMut.mutate(instants);
  };

  const owner = { role: 'owner' as const, isAssignee: false };
  const canOffer = canTransition(visit.status, 'offered', owner);
  const canReschedule = RESCHEDULABLE.has(visit.status);

  return (
    <Card style={{ gap: t.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '800' }]}>
            {visit.client?.name ?? 'Client'} · {visitTimeRange(visit)}
          </Text>
          <Text style={{ color: t.colors.inkMuted, fontSize: 13 }}>
            {formatInTimeZone(new Date(visit.scheduled_start), tz, 'EEEE, MMM d')} ·{' '}
            {visit.service?.name ?? 'Service'} · {walkerName ?? 'Unassigned'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: t.space.sm }}>
          <Button
            title="Open details"
            variant="secondary"
            onPress={() => router.push(`/schedule/${visit.id}` as Href)}
          />
          <Button title="Close" variant="ghost" onPress={onClose} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: t.space.xl, flexWrap: 'wrap' }}>
        {canOffer ? (
          <View style={{ flex: 1, minWidth: 280, gap: t.space.sm }}>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>
              {visit.decline_reason ? 'Reassign' : 'Offer to a walker'}
            </Text>
            <WalkerPicker
              members={members.data ?? []}
              ctx={ctx.data ?? null}
              window={{
                startUtc: new Date(visit.scheduled_start),
                endUtc: new Date(visit.scheduled_end),
              }}
              tz={tz}
              selectedId={pickedWalker}
              onSelect={setPickedWalker}
              excludeVisitId={visit.id}
            />
            {pickedWalker ? (
              <Button
                title="Send offer"
                onPress={() => offerMut.mutate(pickedWalker)}
                loading={offerMut.isPending}
              />
            ) : null}
          </View>
        ) : null}
        {canReschedule ? (
          <View style={{ flex: 1, minWidth: 240, gap: t.space.sm }}>
            <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Reschedule</Text>
            <TextField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" />
            <TextField label="Start time (HH:MM)" value={time} onChangeText={setTime} autoCapitalize="none" />
            <Button
              title="Move visit"
              variant="secondary"
              onPress={submitReschedule}
              loading={rescheduleMut.isPending}
            />
          </View>
        ) : null}
      </View>
      {!canOffer && !canReschedule ? (
        <Text style={{ color: t.colors.inkMuted }}>
          This visit can no longer be reassigned or moved. Open details for the full view.
        </Text>
      ) : null}
      {visit.decline_reason ? (
        <Text style={{ color: t.colors.danger, fontSize: 13 }}>Declined: {visit.decline_reason}</Text>
      ) : null}
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
    </Card>
  );
}

export function WeekGrid({ businessId, tz }: { businessId: string; tz: string }) {
  const t = useTheme();
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const range = useMemo(() => weekRange(anchor, tz), [anchor, tz]);
  const days = useMemo(() => weekDays(anchor, tz), [anchor, tz]);

  const visits = useQuery({
    // 'visits' prefix keeps the persisted-query whitelist semantics; the
    // weekStartYmd segment makes each week its own cache entry.
    queryKey: ['visits', businessId, range.weekStartYmd],
    queryFn: () => listVisits(businessId, { fromUtc: range.fromUtc, toUtc: range.toUtc }),
  });
  const members = useQuery({
    queryKey: ['scheduleMembers', businessId],
    queryFn: () => listActiveMembers(businessId),
  });
  useRefetchOnFocus(visits.refetch);

  const visible = (visits.data ?? []).filter((v) => v.status !== 'cancelled');
  const byDay = visitsByDay(visible, tz);
  const todayYmd = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
  const selected = visible.find((v) => v.id === selectedId) ?? null;

  const hourLabels: number[] = [];
  for (let m = GRID_START_MIN; m <= GRID_END_MIN; m += 60) hourLabels.push(m);

  return (
    <View style={{ gap: t.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
        <Button
          title="← Prev"
          variant="secondary"
          onPress={() => setAnchor((a) => new Date(a.getTime() - 7 * DAY_MS))}
        />
        <Button title="Today" variant="secondary" onPress={() => setAnchor(new Date())} />
        <Button
          title="Next →"
          variant="secondary"
          onPress={() => setAnchor((a) => new Date(a.getTime() + 7 * DAY_MS))}
        />
        <Text style={[t.type.body, { color: t.colors.ink, fontWeight: '700', marginLeft: t.space.sm }]}>
          {days[0]!.label} – {days[6]!.label} · {range.weekStartYmd.slice(0, 7)}
        </Text>
      </View>
      {visits.error ? (
        <Text style={{ color: t.colors.danger }}>
          {visits.error instanceof Error ? visits.error.message : String(visits.error)}
        </Text>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ flexDirection: 'row' }}>
          {/* Hour gutter */}
          <View style={{ width: GUTTER_WIDTH, marginTop: HEADER_HEIGHT, height: GRID_HEIGHT }}>
            {hourLabels.map((m) => (
              <Text
                key={m}
                style={{
                  position: 'absolute',
                  top: (m - GRID_START_MIN) * PX_PER_MIN - 7,
                  right: t.space.sm,
                  color: t.colors.inkMuted,
                  fontSize: 11,
                  fontWeight: '700',
                }}
              >
                {`${String(Math.floor(m / 60)).padStart(2, '0')}:00`}
              </Text>
            ))}
          </View>
          {days.map((day) => {
            const dayVisits = byDay.get(day.ymd) ?? [];
            const isToday = day.ymd === todayYmd;
            return (
              <View key={day.ymd} style={{ width: COL_WIDTH }}>
                <View style={{ height: HEADER_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
                  <Text
                    style={{
                      color: isToday ? t.colors.primary : t.colors.inkMuted,
                      fontSize: 12,
                      fontWeight: '800',
                    }}
                  >
                    {day.label}
                  </Text>
                </View>
                <View
                  style={{
                    height: GRID_HEIGHT,
                    borderLeftWidth: 1,
                    borderLeftColor: t.colors.line,
                    backgroundColor: isToday ? t.colors.surfaceRaised : 'transparent',
                  }}
                >
                  {hourLabels.map((m) => (
                    <View
                      key={m}
                      style={{
                        position: 'absolute',
                        top: (m - GRID_START_MIN) * PX_PER_MIN,
                        left: 0,
                        right: 0,
                        height: 1,
                        backgroundColor: t.colors.line,
                      }}
                    />
                  ))}
                  {dayVisits.map((v) => {
                    const pos = gridPosition(v, tz);
                    const top = Math.max((pos.startMinutes - GRID_START_MIN) * PX_PER_MIN, 0);
                    const rawBottom = (pos.startMinutes - GRID_START_MIN + pos.durationMinutes) * PX_PER_MIN;
                    const height = Math.max(Math.min(rawBottom, GRID_HEIGHT) - top, MIN_BLOCK_PX);
                    const colors = blockColors(t, v.status);
                    const walker = v.walker_id ? memberName(members.data ?? [], v.walker_id) : null;
                    const isSelected = v.id === selectedId;
                    return (
                      <Pressable
                        key={v.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => setSelectedId((cur) => (cur === v.id ? null : v.id))}
                        style={({ pressed }) => ({
                          position: 'absolute',
                          top: Math.min(top, GRID_HEIGHT - MIN_BLOCK_PX),
                          left: 3,
                          right: 3,
                          height,
                          backgroundColor: colors.backgroundColor,
                          borderWidth: isSelected ? 2 : 1,
                          borderColor: isSelected ? t.colors.primary : colors.borderColor,
                          borderRadius: 8,
                          paddingHorizontal: 6,
                          paddingVertical: 3,
                          overflow: 'hidden',
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }} numberOfLines={1}>
                          {v.client?.name ?? 'Client'}
                          {walker ? ` · ${walker.slice(0, 1)}` : ''}
                        </Text>
                        <Text style={{ color: colors.text, fontSize: 10 }} numberOfLines={1}>
                          {visitTimeRange(v)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {visits.isSuccess && visible.length === 0 ? (
        <Text style={{ color: t.colors.inkMuted }}>Nothing scheduled this week.</Text>
      ) : null}

      {selected ? (
        <QuickPanel
          key={selected.id}
          businessId={businessId}
          visit={selected}
          walkerName={selected.walker_id ? memberName(members.data ?? [], selected.walker_id) : null}
          tz={tz}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </View>
  );
}
