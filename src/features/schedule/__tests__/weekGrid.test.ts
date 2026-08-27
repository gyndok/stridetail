import {
  assignLanes,
  gridBounds,
  gridPosition,
  nowIndicator,
  visitsByDay,
  walkerAccentIndexes,
  weekDays,
  weekRange,
} from '../weekGrid';

// America/Chicago: CDT (UTC-5) in summer, CST (UTC-6) in winter.
// Spring forward 2026-03-08 (a Sunday): 02:00 CST -> 03:00 CDT.
// Fall back 2026-11-01 (a Sunday): 02:00 CDT -> 01:00 CST.
const TZ = 'America/Chicago';

describe('weekDays', () => {
  it('returns Sun-Sat of the week containing the anchor, with labels', () => {
    // Wed 2026-08-26 local (Chicago).
    const days = weekDays(new Date('2026-08-26T17:00:00Z'), TZ);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.ymd)).toEqual([
      '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26',
      '2026-08-27', '2026-08-28', '2026-08-29',
    ]);
    expect(days.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days[0]!.label).toBe('Sun 23');
    expect(days[6]!.label).toBe('Sat 29');
  });

  it('uses the LOCAL calendar day, not the UTC day, to pick the week', () => {
    // 2026-08-30T02:00Z is Sunday in UTC but still Saturday Aug 29, 21:00 CDT.
    const days = weekDays(new Date('2026-08-30T02:00:00Z'), TZ);
    expect(days[0]!.ymd).toBe('2026-08-23');
    expect(days[6]!.ymd).toBe('2026-08-29');
  });

  it('crosses month boundaries', () => {
    // Tue 2026-09-01 local -> week Sun Aug 30 .. Sat Sep 5.
    const days = weekDays(new Date('2026-09-01T17:00:00Z'), TZ);
    expect(days[0]!.ymd).toBe('2026-08-30');
    expect(days[0]!.label).toBe('Sun 30');
    expect(days[2]!.ymd).toBe('2026-09-01');
    expect(days[2]!.label).toBe('Tue 1');
  });

  it('is stable across a DST-transition week', () => {
    // Wed 2026-03-11 local -> week starts Sun 2026-03-08 (spring-forward day).
    const days = weekDays(new Date('2026-03-11T17:00:00Z'), TZ);
    expect(days.map((d) => d.ymd)).toEqual([
      '2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11',
      '2026-03-12', '2026-03-13', '2026-03-14',
    ]);
  });
});

describe('weekRange', () => {
  it('returns [local Sunday 00:00, next Sunday 00:00) as UTC instants', () => {
    const r = weekRange(new Date('2026-08-26T17:00:00Z'), TZ);
    expect(r.weekStartYmd).toBe('2026-08-23');
    // Chicago is UTC-5 (CDT) all week.
    expect(r.fromUtc.toISOString()).toBe('2026-08-23T05:00:00.000Z');
    expect(r.toUtc.toISOString()).toBe('2026-08-30T05:00:00.000Z');
  });

  it('is DST-safe: the spring-forward week is 167 hours long', () => {
    const r = weekRange(new Date('2026-03-11T17:00:00Z'), TZ);
    // Sunday 2026-03-08 00:00 CST (UTC-6) .. Sunday 2026-03-15 00:00 CDT (UTC-5).
    expect(r.fromUtc.toISOString()).toBe('2026-03-08T06:00:00.000Z');
    expect(r.toUtc.toISOString()).toBe('2026-03-15T05:00:00.000Z');
    expect((r.toUtc.getTime() - r.fromUtc.getTime()) / 3_600_000).toBe(167);
  });
});

describe('visitsByDay', () => {
  const v = (id: string, startIso: string) => ({ id, scheduled_start: startIso });

  it('buckets by LOCAL day in the business tz and sorts within a day', () => {
    const map = visitsByDay(
      [
        v('b', '2026-08-24T19:00:00Z'), // Mon 14:00 CDT
        v('a', '2026-08-24T14:00:00Z'), // Mon 09:00 CDT
        // 2026-08-24T03:30Z is Sunday Aug 23, 22:30 CDT — the UTC day lies.
        v('c', '2026-08-24T03:30:00Z'),
      ],
      TZ,
    );
    expect([...map.keys()].sort()).toEqual(['2026-08-23', '2026-08-24']);
    expect(map.get('2026-08-23')!.map((x) => x.id)).toEqual(['c']);
    expect(map.get('2026-08-24')!.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('returns an empty map for no visits', () => {
    expect(visitsByDay([], TZ).size).toBe(0);
  });
});

describe('gridPosition', () => {
  const pos = (startIso: string, endIso: string) =>
    gridPosition({ scheduled_start: startIso, scheduled_end: endIso }, TZ);

  it('positions a plain visit by local wall time', () => {
    // Mon 2026-08-24 09:00–09:30 CDT.
    const p = pos('2026-08-24T14:00:00Z', '2026-08-24T14:30:00Z');
    expect(p).toEqual({ dayIndex: 1, startMinutes: 9 * 60, durationMinutes: 30 });
  });

  it('spring forward: a 60-real-minute visit crossing the gap spans 120 wall minutes', () => {
    // Sun 2026-03-08, 01:45 CST (07:45Z) + 60 real min = 03:45 CDT (08:45Z).
    const p = pos('2026-03-08T07:45:00Z', '2026-03-08T08:45:00Z');
    expect(p.dayIndex).toBe(0);
    expect(p.startMinutes).toBe(1 * 60 + 45);
    expect(p.durationMinutes).toBe(120);
  });

  it('fall back: a visit spanning the repeated hour keeps its real length', () => {
    // Sun 2026-11-01, 01:30 CDT (06:30Z) + 60 real min = 01:30 CST (07:30Z):
    // wall-clock diff is 0, so the real elapsed minutes are used instead.
    const p = pos('2026-11-01T06:30:00Z', '2026-11-01T07:30:00Z');
    expect(p.dayIndex).toBe(0);
    expect(p.startMinutes).toBe(1 * 60 + 30);
    expect(p.durationMinutes).toBe(60);
  });

  it('clamps a midnight-crossing visit to the end of its start day', () => {
    // Mon 23:30 CDT -> Tue 00:15 CDT.
    const p = pos('2026-08-25T04:30:00Z', '2026-08-25T05:15:00Z');
    expect(p.dayIndex).toBe(1);
    expect(p.startMinutes).toBe(23 * 60 + 30);
    expect(p.durationMinutes).toBe(30); // 1440 - 1410
  });
});

describe('assignLanes', () => {
  const item = (startMinutes: number, durationMinutes: number) => ({ startMinutes, durationMinutes });

  it('gives non-overlapping visits full width (lane 0 of 1)', () => {
    const lanes = assignLanes([item(420, 30), item(480, 30), item(600, 60)]);
    expect(lanes).toEqual([
      { lane: 0, laneCount: 1 },
      { lane: 0, laneCount: 1 },
      { lane: 0, laneCount: 1 },
    ]);
  });

  it('splits two overlapping visits into side-by-side lanes', () => {
    const lanes = assignLanes([item(420, 60), item(450, 60)]);
    expect(lanes).toEqual([
      { lane: 0, laneCount: 2 },
      { lane: 1, laneCount: 2 },
    ]);
  });

  it('an end-touching-start pair does NOT overlap (half-open intervals)', () => {
    const lanes = assignLanes([item(420, 30), item(450, 30)]);
    expect(lanes.map((l) => l.laneCount)).toEqual([1, 1]);
  });

  it('chained overlaps form ONE cluster and reuse freed lanes', () => {
    // A 07:00–08:00, B 07:30–08:30, C 08:10–08:40: A∩B, B∩C, but not A∩C —
    // one cluster, two lanes, C back in lane 0.
    const lanes = assignLanes([item(420, 60), item(450, 60), item(490, 30)]);
    expect(lanes).toEqual([
      { lane: 0, laneCount: 2 },
      { lane: 1, laneCount: 2 },
      { lane: 0, laneCount: 2 },
    ]);
  });

  it('triple overlap needs three lanes', () => {
    const lanes = assignLanes([item(420, 90), item(430, 90), item(440, 90)]);
    expect(lanes).toEqual([
      { lane: 0, laneCount: 3 },
      { lane: 1, laneCount: 3 },
      { lane: 2, laneCount: 3 },
    ]);
  });

  it('independent clusters get independent lane counts', () => {
    const lanes = assignLanes([item(420, 60), item(450, 60), item(900, 30)]);
    expect(lanes[2]).toEqual({ lane: 0, laneCount: 1 });
    expect(lanes[0]!.laneCount).toBe(2);
  });

  it('minDuration makes visually-colliding short visits overlap', () => {
    // 20:11 and 20:25, 10 real minutes each: no time overlap, but 22-minute
    // minimum block heights collide on screen.
    const items = [item(20 * 60 + 11, 10), item(20 * 60 + 25, 10)];
    expect(assignLanes(items).map((l) => l.laneCount)).toEqual([1, 1]);
    expect(assignLanes(items, 22)).toEqual([
      { lane: 0, laneCount: 2 },
      { lane: 1, laneCount: 2 },
    ]);
  });

  it('handles identical start times and unsorted input, keyed to input order', () => {
    const lanes = assignLanes([item(600, 30), item(420, 30), item(420, 30)]);
    // Result index i describes input item i.
    expect(lanes[0]).toEqual({ lane: 0, laneCount: 1 });
    expect(new Set(lanes.slice(1).map((l) => l.lane))).toEqual(new Set([0, 1]));
    expect(lanes[1]!.laneCount).toBe(2);
    expect(lanes[2]!.laneCount).toBe(2);
  });

  it('returns [] for no visits', () => {
    expect(assignLanes([])).toEqual([]);
  });
});

describe('gridBounds', () => {
  const item = (startMinutes: number, durationMinutes: number) => ({ startMinutes, durationMinutes });

  it('returns the 06:00–21:00 default when every visit fits (and when empty)', () => {
    expect(gridBounds([])).toEqual({ startMin: 360, endMin: 1260 });
    expect(gridBounds([item(420, 30), item(1200, 30)])).toEqual({ startMin: 360, endMin: 1260 });
  });

  it('extends the bottom to the next full hour after the latest end', () => {
    // 21:27 + 30 min ends 21:57 -> 22:00.
    expect(gridBounds([item(21 * 60 + 27, 30)])).toEqual({ startMin: 360, endMin: 1320 });
  });

  it('extends the top to the full hour before the earliest start', () => {
    // 05:15 start -> 05:00.
    expect(gridBounds([item(5 * 60 + 15, 30)])).toEqual({ startMin: 300, endMin: 1260 });
  });

  it('an exactly-on-the-hour end does not add an extra hour', () => {
    expect(gridBounds([item(21 * 60, 60)])).toEqual({ startMin: 360, endMin: 1320 });
  });

  it('clamps to the [00:00, 24:00) day', () => {
    expect(gridBounds([item(0, 20), item(23 * 60 + 30, 30)])).toEqual({ startMin: 0, endMin: 1440 });
  });
});

describe('nowIndicator', () => {
  const week = [
    '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26',
    '2026-08-27', '2026-08-28', '2026-08-29',
  ];

  it('places now in the LOCAL day column at local wall minutes', () => {
    // 2026-08-27T01:30Z is Wed Aug 26, 20:30 CDT.
    expect(nowIndicator(new Date('2026-08-27T01:30:00Z'), TZ, week)).toEqual({
      dayIndex: 3,
      minutes: 20 * 60 + 30,
    });
  });

  it('returns null when today is outside the viewed week', () => {
    expect(nowIndicator(new Date('2026-09-05T12:00:00Z'), TZ, week)).toBeNull();
  });
});

describe('walkerAccentIndexes', () => {
  const m = (user_id: string, role: 'owner' | 'walker') => ({ user_id, role });

  it('owner gets accent 0 even when listed after walkers, others keep list order', () => {
    const map = walkerAccentIndexes([m('w1', 'walker'), m('own', 'owner'), m('w2', 'walker')], 6);
    expect(map.get('own')).toBe(0);
    expect(map.get('w1')).toBe(1);
    expect(map.get('w2')).toBe(2);
  });

  it('cycles when there are more members than accents', () => {
    const map = walkerAccentIndexes(
      [m('own', 'owner'), m('a', 'walker'), m('b', 'walker'), m('c', 'walker')],
      3,
    );
    expect(map.get('c')).toBe(0);
  });

  it('is stable: the same members yield the same indexes regardless of extra calls', () => {
    const members = [m('own', 'owner'), m('a', 'walker')];
    expect(walkerAccentIndexes(members, 6)).toEqual(walkerAccentIndexes([...members], 6));
  });
});
