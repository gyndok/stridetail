import { gridPosition, visitsByDay, weekDays, weekRange } from '../weekGrid';

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
