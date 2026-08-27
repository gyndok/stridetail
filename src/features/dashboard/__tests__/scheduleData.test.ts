import type { ScheduleMember, Visit } from '@/src/features/schedule/api';
import { weekDays } from '@/src/features/schedule/weekGrid';

import {
  capRows,
  countVisitsByDay,
  currentYm,
  monthGrid,
  monthRangeUtc,
  monthTitle,
  shiftMonth,
  statusTone,
  todayYmd,
  weekLabel,
  weekTableRows,
} from '../scheduleData';

// Pure shaping for the dashboard schedule panel (Plan 8b Task 3). All fixtures
// are America/Chicago — the DST cases below cross the 2026-03-08 spring-forward.

jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));

const TZ = 'America/Chicago';

const members: ScheduleMember[] = [
  { user_id: 'u-owner', role: 'owner', display_name: 'Alexandra' },
  { user_id: 'u-ben', role: 'walker', display_name: 'Ben' },
];

function makeVisit(over: Partial<Visit> & { id: string; scheduled_start: string }): Visit {
  return {
    business_id: 'b1',
    client_id: 'c1',
    service_id: 's1',
    series_id: null,
    walker_id: 'u-ben',
    pet_ids: ['p1'],
    scheduled_end: new Date(new Date(over.scheduled_start).getTime() + 1_800_000).toISOString(),
    business_tz: TZ,
    status: 'accepted',
    owner_notes_md: null,
    decline_reason: null,
    started_at: null,
    finished_at: null,
    client: { name: 'Dana' },
    service: { name: '30-min walk', duration_min: 30 },
    ...over,
  };
}

const petNames = new Map([
  ['p1', 'Rex'],
  ['p2', 'Bella'],
]);

describe('weekTableRows', () => {
  // 2026-08-24 is a Monday; 14:00Z = 09:00 CDT.
  const visits: Visit[] = [
    makeVisit({ id: 'v-late', scheduled_start: '2026-08-25T20:00:00Z' }),
    makeVisit({
      id: 'v-early',
      scheduled_start: '2026-08-24T14:00:00Z',
      walker_id: null,
      status: 'unassigned',
      pet_ids: ['p1', 'p2'],
    }),
    makeVisit({ id: 'v-cancelled', scheduled_start: '2026-08-24T15:00:00Z', status: 'cancelled' }),
    makeVisit({ id: 'v-owner', scheduled_start: '2026-08-24T16:00:00Z', walker_id: 'u-owner' }),
  ];

  test('drops cancelled, sorts by start, shapes labels in the business tz', () => {
    const rows = weekTableRows(visits, members, petNames, TZ);
    expect(rows.map((r) => r.id)).toEqual(['v-early', 'v-owner', 'v-late']);
    expect(rows[0]).toEqual({
      id: 'v-early',
      timeLabel: 'Mon 24, 09:00',
      clientName: 'Dana',
      petNames: 'Rex, Bella',
      serviceName: '30-min walk',
      walkerName: null, // unassigned chip
      status: 'unassigned',
    });
    expect(rows[1]!.walkerName).toBe('Alexandra');
    expect(rows[2]!.walkerName).toBe('Ben');
  });

  test('walker filter narrows to that walker (unassigned rows drop out)', () => {
    const rows = weekTableRows(visits, members, petNames, TZ, 'u-ben');
    expect(rows.map((r) => r.id)).toEqual(['v-late']);
  });

  test('unknown pet ids and missing embeds fall back gracefully', () => {
    const rows = weekTableRows(
      [makeVisit({ id: 'v', scheduled_start: '2026-08-24T14:00:00Z', pet_ids: ['nope'], client: null, service: null })],
      members,
      petNames,
      TZ,
    );
    expect(rows[0]!.petNames).toBe('');
    expect(rows[0]!.clientName).toBe('Client');
    expect(rows[0]!.serviceName).toBe('Service');
  });
});

describe('capRows', () => {
  test('caps at 12 by default and counts the rest', () => {
    const rows = Array.from({ length: 15 }, (_, i) => i);
    expect(capRows(rows)).toEqual({ visible: rows.slice(0, 12), moreCount: 3 });
    expect(capRows(rows.slice(0, 12))).toEqual({ visible: rows.slice(0, 12), moreCount: 0 });
    expect(capRows([])).toEqual({ visible: [], moreCount: 0 });
  });
});

describe('weekLabel', () => {
  test('same-month week', () => {
    // Week of Wed 2026-08-26 -> Sun Aug 23 .. Sat Aug 29.
    expect(weekLabel(weekDays(new Date('2026-08-26T12:00:00Z'), TZ))).toBe('Aug 23 – 29');
  });

  test('cross-month week', () => {
    // Week of Mon 2026-08-31 -> Sun Aug 30 .. Sat Sep 5.
    expect(weekLabel(weekDays(new Date('2026-08-31T12:00:00Z'), TZ))).toBe('Aug 30 – Sep 5');
  });
});

describe('statusTone', () => {
  test('matches the week grid grouping', () => {
    expect(statusTone('unassigned')).toBe('warning');
    expect(statusTone('offered')).toBe('muted');
    expect(statusTone('accepted')).toBe('positive');
    expect(statusTone('in_progress')).toBe('positive');
    expect(statusTone('completed')).toBe('positive');
  });
});

describe('monthGrid', () => {
  test('August 2026: Sun-first, leading pad, six weeks', () => {
    const weeks = monthGrid('2026-08');
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // Aug 1 2026 is a Saturday: six nulls then day 1.
    expect(weeks[0]!.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(weeks[0]![6]).toEqual({ ymd: '2026-08-01', day: 1 });
    // Aug 31 2026 is a Monday: last week is [30, 31, null x5].
    expect(weeks[5]![0]).toEqual({ ymd: '2026-08-30', day: 30 });
    expect(weeks[5]![1]).toEqual({ ymd: '2026-08-31', day: 31 });
    expect(weeks[5]!.slice(2)).toEqual([null, null, null, null, null]);
  });

  test('February 2026 starts on Sunday and fits exactly four weeks', () => {
    const weeks = monthGrid('2026-02');
    expect(weeks).toHaveLength(4);
    expect(weeks[0]![0]).toEqual({ ymd: '2026-02-01', day: 1 });
    expect(weeks[3]![6]).toEqual({ ymd: '2026-02-28', day: 28 });
  });
});

describe('shiftMonth / monthTitle / currentYm / todayYmd', () => {
  test('shifts across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-08', 0)).toBe('2026-08');
  });

  test('labels and now-derived keys', () => {
    expect(monthTitle('2026-08')).toBe('August 2026');
    // 2026-09-01T03:00Z is still Aug 31 evening in Chicago.
    expect(currentYm(new Date('2026-09-01T03:00:00Z'), TZ)).toBe('2026-08');
    expect(todayYmd(new Date('2026-09-01T03:00:00Z'), TZ)).toBe('2026-08-31');
  });
});

describe('monthRangeUtc — DST month', () => {
  test('March 2026 in Chicago is one hour short of 31 days', () => {
    const { fromUtc, toUtc } = monthRangeUtc('2026-03', TZ);
    // CST (-6) at the start, CDT (-5) after spring-forward on Mar 8.
    expect(fromUtc.toISOString()).toBe('2026-03-01T06:00:00.000Z');
    expect(toUtc.toISOString()).toBe('2026-04-01T05:00:00.000Z');
    expect(toUtc.getTime() - fromUtc.getTime()).toBe(31 * 86_400_000 - 3_600_000);
  });
});

describe('countVisitsByDay', () => {
  test('buckets by local day across the DST transition and drops cancelled', () => {
    const visits = [
      // 20:00Z on Mar 8 = 15:00 CDT (after spring-forward) -> Mar 8.
      { scheduled_start: '2026-03-08T20:00:00Z', status: 'accepted' },
      // 04:30Z on Mar 9 = 23:30 CDT on Mar 8 -> still Mar 8 locally.
      { scheduled_start: '2026-03-09T04:30:00Z', status: 'completed' },
      { scheduled_start: '2026-03-10T15:00:00Z', status: 'unassigned' },
      { scheduled_start: '2026-03-10T16:00:00Z', status: 'cancelled' },
    ];
    const counts = countVisitsByDay(visits, TZ);
    expect(counts.get('2026-03-08')).toBe(2);
    expect(counts.get('2026-03-09')).toBeUndefined();
    expect(counts.get('2026-03-10')).toBe(1);
  });

  test('month-boundary fixture: late local Aug 31 vs early Sep 1', () => {
    const visits = [
      // 2026-09-01T03:00Z = Aug 31 22:00 CDT.
      { scheduled_start: '2026-09-01T03:00:00Z', status: 'accepted' },
      // 2026-09-01T13:00Z = Sep 1 08:00 CDT.
      { scheduled_start: '2026-09-01T13:00:00Z', status: 'accepted' },
    ];
    const counts = countVisitsByDay(visits, TZ);
    expect(counts.get('2026-08-31')).toBe(1);
    expect(counts.get('2026-09-01')).toBe(1);
  });
});
