import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { canTransition } from '@/src/lib/schedule/machine';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';
import { tokens } from '@/src/ui/tokens';

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
import {
  assignLanes,
  gridBounds,
  gridPosition,
  nowIndicator,
  visitsByDay,
  walkerAccentIndexes,
  weekDays,
  weekRange,
} from './weekGrid';

// Desktop week grid (Plan 4 Task 8). Web >= 900 px only — the mobile list is
// untouched. All day/column math happens in the BUSINESS tz via the pure
// helpers in weekGrid.ts.

const DAY_MS = 86_400_000;
const PX_PER_MIN = 1;
const COL_WIDTH = 150;
const GUTTER_WIDTH = 52;
const HEADER_HEIGHT = 34;
/** Tap-target floor: a 20-minute visit still renders (and hits) at this height. */
const MIN_BLOCK_PX = 22;
/** Below this card height only the compact one-line label fits without clipping. */
const TWO_LINE_MIN_PX = 34;
/** Width of the per-walker accent strip on the card's left edge. */
const ACCENT_WIDTH = 4;
/** Horizontal gap between side-by-side lanes and the column edge inset. */
const LANE_GAP = 2;
const CARD_INSET = 3;

/** Statuses a visit may be rescheduled from (moving a running/done visit is meaningless). */
const RESCHEDULABLE = new Set(['unassigned', 'offered', 'accepted']);

/**
 * Status-differentiated card styling, aligned with the dashboard's statusTone
 * vocabulary (scheduleData.ts): unassigned/offered are 'warning' — they need
 * the owner's action (dashed warning outline); in_progress is live (primary
 * outline, bold); completed is history (desaturated, muted ink); accepted is
 * the normal covered card (Round 0 green). Cancelled never reaches here — the
 * grid filters it out.
 */
function blockColors(t: ReturnType<typeof useTheme>, status: Visit['status']) {
  if (status === 'unassigned' || status === 'offered') {
    return {
      backgroundColor: t.colors.surfaceRaised,
      borderColor: t.colors.warning,
      borderStyle: 'dashed' as const,
      borderWidth: 1,
      text: t.colors.ink,
      bold: false,
    };
  }
  if (status === 'in_progress') {
    return {
      backgroundColor: t.colors.primarySoft,
      borderColor: t.colors.primary,
      borderStyle: 'solid' as const,
      borderWidth: 2,
      text: t.colors.ink,
      bold: true,
    };
  }
  if (status === 'completed') {
    return {
      backgroundColor: t.colors.surface,
      borderColor: t.colors.line,
      borderStyle: 'solid' as const,
      borderWidth: 1,
      text: t.colors.inkMuted,
      bold: false,
    };
  }
  // accepted (the normal scheduled card): the covered state (Round 0 green).
  return {
    backgroundColor: t.colors.greenSoft,
    borderColor: t.colors.green,
    borderStyle: 'solid' as const,
    borderWidth: 1,
    text: t.colors.ink,
    bold: false,
  };
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
    // The unified visit screen (VisitScreen.tsx) reads ['visitDetail', id].
    void queryClient.invalidateQueries({ queryKey: ['visitDetail', visit.id] });
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

  // Minute tick so the "now" line (and the today tint at midnight) tracks time.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const visible = (visits.data ?? []).filter((v) => v.status !== 'cancelled');
  const byDay = visitsByDay(visible, tz);
  const todayYmd = formatInTimeZone(now, tz, 'yyyy-MM-dd');
  const selected = visible.find((v) => v.id === selectedId) ?? null;

  // One gridPosition per visit, reused for the adaptive bounds AND the cards.
  const posById = new Map(visible.map((v) => [v.id, gridPosition(v, tz)]));
  // Adaptive hour range: the 06:00–21:00 default, extended so nothing clips.
  const bounds = gridBounds([...posById.values()]);
  const gridHeight = (bounds.endMin - bounds.startMin) * PX_PER_MIN;
  // Per-walker accents: owner first, stable in roster order (legend + strips).
  const accentIx = walkerAccentIndexes(members.data ?? [], tokens.walkerAccents.length);
  const accentOf = (walkerId: string) =>
    tokens.walkerAccents[accentIx.get(walkerId) ?? 0] ?? tokens.walkerAccents[0];
  const nowPos = nowIndicator(now, tz, days.map((d) => d.ymd));

  const hourLabels: number[] = [];
  for (let m = bounds.startMin; m <= bounds.endMin; m += 60) hourLabels.push(m);

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

      {/* Walker legend: the color IS the identification on the cards. */}
      {(members.data ?? []).length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md, alignItems: 'center' }}>
          {(members.data ?? []).map((m) => (
            <View key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.xs }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: accentOf(m.user_id),
                }}
              />
              <Text style={{ color: t.colors.inkMuted, fontSize: 12, fontWeight: '700' }}>
                {m.display_name ?? 'Team member'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ flexDirection: 'row' }}>
          {/* Hour gutter */}
          <View style={{ width: GUTTER_WIDTH, marginTop: HEADER_HEIGHT, height: gridHeight }}>
            {hourLabels.map((m) => (
              <Text
                key={m}
                style={{
                  position: 'absolute',
                  top: (m - bounds.startMin) * PX_PER_MIN - 7,
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
            // Side-by-side lanes for time-overlapping visits; minimum-height
            // inflation so short back-to-back cards never stack on screen.
            const positions = dayVisits.map((v) => posById.get(v.id)!);
            const lanes = assignLanes(positions, MIN_BLOCK_PX / PX_PER_MIN);
            const innerWidth = COL_WIDTH - 2 * CARD_INSET;
            const showNow =
              isToday &&
              nowPos !== null &&
              nowPos.minutes >= bounds.startMin &&
              nowPos.minutes <= bounds.endMin;
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
                    height: gridHeight,
                    borderLeftWidth: 1,
                    borderLeftColor: t.colors.line,
                    backgroundColor: isToday ? t.colors.primarySoft : 'transparent',
                  }}
                >
                  {hourLabels.map((m) => (
                    <View
                      key={m}
                      style={{
                        position: 'absolute',
                        top: (m - bounds.startMin) * PX_PER_MIN,
                        left: 0,
                        right: 0,
                        height: 1,
                        backgroundColor: t.colors.line,
                      }}
                    />
                  ))}
                  {dayVisits.map((v, i) => {
                    const pos = positions[i]!;
                    const lane = lanes[i]!;
                    const top = Math.max((pos.startMinutes - bounds.startMin) * PX_PER_MIN, 0);
                    const rawBottom = (pos.startMinutes - bounds.startMin + pos.durationMinutes) * PX_PER_MIN;
                    const height = Math.max(Math.min(rawBottom, gridHeight) - top, MIN_BLOCK_PX);
                    const laneWidth = (innerWidth - (lane.laneCount - 1) * LANE_GAP) / lane.laneCount;
                    const left = CARD_INSET + lane.lane * (laneWidth + LANE_GAP);
                    const colors = blockColors(t, v.status);
                    const walker = v.walker_id ? memberName(members.data ?? [], v.walker_id) : null;
                    const isSelected = v.id === selectedId;
                    const clientName = v.client?.name ?? 'Client';
                    const timeRange = visitTimeRange(v);
                    // One compact line when the card is too short for two —
                    // never vertical clipping mid-glyph.
                    const twoLines = height >= TWO_LINE_MIN_PX;
                    // The color strip is the walker signal; the initial only
                    // rides along at full column width.
                    const initial = walker && lane.laneCount === 1 ? ` · ${walker.slice(0, 1)}` : '';
                    return (
                      <Pressable
                        key={v.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${clientName}, ${timeRange}, ${walker ?? 'unassigned'}`}
                        onPress={() => setSelectedId((cur) => (cur === v.id ? null : v.id))}
                        style={({ pressed }) => ({
                          position: 'absolute',
                          top: Math.min(top, gridHeight - MIN_BLOCK_PX),
                          left,
                          width: laneWidth,
                          height,
                          backgroundColor: colors.backgroundColor,
                          borderWidth: isSelected ? 2 : colors.borderWidth,
                          borderStyle: colors.borderStyle,
                          borderColor: isSelected ? t.colors.primary : colors.borderColor,
                          borderRadius: 8,
                          paddingLeft: 6 + (walker ? ACCENT_WIDTH : 0),
                          paddingRight: 5,
                          justifyContent: 'center',
                          overflow: 'hidden',
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        {v.walker_id ? (
                          <View
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: ACCENT_WIDTH,
                              backgroundColor: accentOf(v.walker_id),
                            }}
                          />
                        ) : null}
                        {twoLines ? (
                          <>
                            <Text
                              style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}
                              numberOfLines={1}
                            >
                              {clientName}
                              {initial}
                            </Text>
                            <Text style={{ color: colors.text, fontSize: 10 }} numberOfLines={1}>
                              {timeRange}
                            </Text>
                          </>
                        ) : (
                          <Text
                            style={{
                              color: colors.text,
                              fontSize: 10,
                              fontWeight: colors.bold ? '800' : '700',
                            }}
                            numberOfLines={1}
                          >
                            {clientName} · {timeRange.split(' ')[0]}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                  {showNow ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: (nowPos.minutes - bounds.startMin) * PX_PER_MIN - 1,
                        left: 0,
                        right: 0,
                        height: 2,
                        backgroundColor: t.colors.primary,
                      }}
                    />
                  ) : null}
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
        // Floats over the viewport (web `position: fixed`): the grid is
        // ~1700px tall, so a panel rendered after it sits far below the fold —
        // clicking a card looked like nothing happened (sponsor report,
        // Safari 2026-08-27). Bottom-docked, it appears wherever you click.
        <View
          style={
            {
              position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
              bottom: 16,
              left: 16,
              right: 16,
              alignItems: 'center',
              zIndex: 1000,
            } as const
          }
        >
          <View
            style={{
              width: '100%',
              maxWidth: 820,
              backgroundColor: t.colors.surfaceRaised,
              borderRadius: t.radius.card,
              borderWidth: 1,
              borderColor: t.colors.line,
              shadowColor: t.colors.ink,
              shadowOpacity: 0.18,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 8 },
            }}
          >
            <QuickPanel
              key={selected.id}
              businessId={businessId}
              visit={selected}
              walkerName={selected.walker_id ? memberName(members.data ?? [], selected.walker_id) : null}
              tz={tz}
              onClose={() => setSelectedId(null)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
