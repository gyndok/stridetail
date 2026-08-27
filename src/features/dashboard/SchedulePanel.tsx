import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { Chip } from '@/src/features/schedule/Chip';
import { weekDays } from '@/src/features/schedule/weekGrid';
import { useTheme } from '@/src/ui/theme';

import { PanelCard } from './PanelCard';
import {
  capRows,
  currentYm,
  monthGrid,
  monthTitle,
  shiftMonth,
  statusTone,
  todayYmd,
  useMonthVisitCounts,
  useScheduleMembers,
  useWeekSchedule,
  weekLabel,
  weekTableRows,
  STATUS_LABELS,
  type ScheduleRow,
  type WalkerFilter,
} from './scheduleData';

// Plan 8b Task 3 — the dashboard's schedule slot: a week schedule TABLE (the
// mockup's "Walk Schedule Wkly", distinct from the Schedule tab's week grid)
// plus a month mini-calendar with per-day walk counts. All day/week math runs
// in the BUSINESS tz via scheduleData.ts pure helpers; queries reuse the
// schedule feature's api. No props — OwnerDashboard renders <SchedulePanel />.

const DAY_MS = 86_400_000;
const ROW_CAP = 12;
const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** ‹ / › week-month steppers, shared look. */
function Arrow({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: t.space.sm,
        paddingVertical: t.space.xs,
        borderRadius: t.radius.input,
        borderWidth: 1,
        borderColor: t.colors.line,
        backgroundColor: t.colors.surfaceRaised,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: t.colors.ink, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

/** Status pill — WeekGridView's blockColors grouping in pill form. */
function StatusPill({ status }: { status: ScheduleRow['status'] }) {
  const t = useTheme();
  const tone = statusTone(status);
  const colors =
    tone === 'warning'
      ? { bg: t.colors.surfaceRaised, border: t.colors.warning, text: t.colors.warning }
      : tone === 'muted'
        ? { bg: t.colors.surface, border: t.colors.line, text: t.colors.inkMuted }
        : { bg: t.colors.greenSoft, border: t.colors.green, text: t.colors.green };
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: t.radius.pill,
        paddingHorizontal: t.space.sm,
        paddingVertical: 1,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

function WeekRow({ row, onPress }: { row: ScheduleRow; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.sm,
        paddingVertical: t.space.xs + 2,
        borderTopWidth: 1,
        borderTopColor: t.colors.line,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: t.colors.ink, fontWeight: '700', fontSize: 12, width: 86 }}>
        {row.timeLabel}
      </Text>
      <View style={{ flex: 1.3, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: t.colors.ink, fontWeight: '700', fontSize: 13 }}>
          {row.clientName}
        </Text>
        {row.petNames ? (
          <Text numberOfLines={1} style={{ color: t.colors.inkMuted, fontSize: 12 }}>
            {row.petNames}
          </Text>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ flex: 1, color: t.colors.inkMuted, fontSize: 12 }}>
        {row.serviceName}
      </Text>
      {row.walkerName ? (
        <Text numberOfLines={1} style={{ flex: 1, color: t.colors.ink, fontSize: 12 }}>
          {row.walkerName}
        </Text>
      ) : (
        <View style={{ flex: 1 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              borderColor: t.colors.warning,
              borderWidth: 1,
              borderRadius: t.radius.pill,
              paddingHorizontal: t.space.sm,
              paddingVertical: 1,
            }}
          >
            <Text style={{ color: t.colors.warning, fontSize: 11, fontWeight: '700' }}>
              Unassigned
            </Text>
          </View>
        </View>
      )}
      <StatusPill status={row.status} />
    </Pressable>
  );
}

export function SchedulePanel() {
  const t = useTheme();
  const router = useRouter();
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const tz =
    memberships.data?.find((m) => m.business_id === businessId)?.business.time_zone ?? null;

  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [walkerFilter, setWalkerFilter] = useState<WalkerFilter>('all');
  // null until the first arrow press — the current month tracks tz once known.
  const [pickedYm, setPickedYm] = useState<string | null>(null);
  const ym = pickedYm ?? (tz ? currentYm(new Date(), tz) : null);

  const week = useWeekSchedule(businessId, tz, weekAnchor);
  const monthCounts = useMonthVisitCounts(businessId, tz, ym);
  const members = useScheduleMembers(businessId);

  const days = tz ? weekDays(weekAnchor, tz) : null;
  const rows =
    tz && week.data
      ? weekTableRows(week.data.visits, members.data ?? [], week.data.petNamesById, tz, walkerFilter)
      : [];
  const { visible, moreCount } = capRows(rows, ROW_CAP);
  const today = tz ? todayYmd(new Date(), tz) : null;

  const openSchedule = () => router.push('/schedule' as Href);

  return (
    <View style={{ gap: t.space.md }}>
      <PanelCard title="This week" action={{ label: 'Open schedule', onPress: openSchedule }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
          <Arrow
            label="‹"
            hint="Previous week"
            onPress={() => setWeekAnchor((a) => new Date(a.getTime() - 7 * DAY_MS))}
          />
          <Arrow
            label="›"
            hint="Next week"
            onPress={() => setWeekAnchor((a) => new Date(a.getTime() + 7 * DAY_MS))}
          />
          {days ? (
            <Text style={{ color: t.colors.ink, fontWeight: '800' }}>{weekLabel(days)}</Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs }}>
          <Chip label="All" selected={walkerFilter === 'all'} onPress={() => setWalkerFilter('all')} />
          {(members.data ?? []).map((m) => (
            <Chip
              key={m.user_id}
              label={m.display_name ?? 'Team member'}
              selected={walkerFilter === m.user_id}
              onPress={() => setWalkerFilter(m.user_id)}
            />
          ))}
        </View>

        {week.error ? (
          <Text style={{ color: t.colors.danger }}>
            {week.error instanceof Error ? week.error.message : String(week.error)}
          </Text>
        ) : null}
        {week.isLoading ? <Text style={{ color: t.colors.inkMuted }}>Loading…</Text> : null}
        {week.isSuccess && rows.length === 0 ? (
          <Text style={{ color: t.colors.inkMuted }}>No visits this week.</Text>
        ) : null}

        <View>
          {visible.map((row) => (
            <WeekRow
              key={row.id}
              row={row}
              onPress={() => router.push(`/schedule/${row.id}` as Href)}
            />
          ))}
        </View>
        {moreCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={openSchedule}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: t.colors.primary, fontWeight: '700' }}>
              +{moreCount} more this week
            </Text>
          </Pressable>
        ) : null}
      </PanelCard>

      <PanelCard title="Month">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
          <Arrow
            label="‹"
            hint="Previous month"
            onPress={() => ym && setPickedYm(shiftMonth(ym, -1))}
          />
          <Arrow label="›" hint="Next month" onPress={() => ym && setPickedYm(shiftMonth(ym, 1))} />
          {ym ? <Text style={{ color: t.colors.ink, fontWeight: '800' }}>{monthTitle(ym)}</Text> : null}
        </View>

        <View style={{ flexDirection: 'row' }}>
          {WEEKDAY_HEADERS.map((d, i) => (
            <Text
              key={`${d}-${i}`}
              style={{
                flex: 1,
                textAlign: 'center',
                color: t.colors.inkMuted,
                fontSize: 11,
                fontWeight: '800',
              }}
            >
              {d}
            </Text>
          ))}
        </View>
        {ym
          ? monthGrid(ym).map((week7, wi) => (
              <View key={wi} style={{ flexDirection: 'row' }}>
                {week7.map((cell, ci) =>
                  cell ? (
                    <Pressable
                      key={cell.ymd}
                      accessibilityRole="button"
                      accessibilityLabel={`Open schedule, ${cell.ymd}`}
                      // Schedule tab takes no date param yet (see DEVIATIONS) —
                      // plain navigate.
                      onPress={openSchedule}
                      style={({ pressed }) => ({
                        flex: 1,
                        alignItems: 'center',
                        gap: 1,
                        paddingVertical: t.space.xs,
                        borderRadius: t.radius.input,
                        borderWidth: 1,
                        borderColor: cell.ymd === today ? t.colors.primary : 'transparent',
                        backgroundColor:
                          cell.ymd === today ? t.colors.surfaceRaised : 'transparent',
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text
                        style={{
                          color: cell.ymd === today ? t.colors.primary : t.colors.ink,
                          fontSize: 12,
                          fontWeight: cell.ymd === today ? '800' : '600',
                        }}
                      >
                        {cell.day}
                      </Text>
                      {(monthCounts.data?.get(cell.ymd) ?? 0) > 0 ? (
                        <View
                          style={{
                            backgroundColor: t.colors.primary,
                            borderRadius: t.radius.pill,
                            minWidth: 16,
                            paddingHorizontal: 3,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: t.colors.onPrimary, fontSize: 10, fontWeight: '800' }}>
                            {monthCounts.data!.get(cell.ymd)}
                          </Text>
                        </View>
                      ) : (
                        <View style={{ height: 13 }} />
                      )}
                    </Pressable>
                  ) : (
                    <View key={`blank-${wi}-${ci}`} style={{ flex: 1 }} />
                  ),
                )}
              </View>
            ))
          : null}
      </PanelCard>
    </View>
  );
}
