import { expandWeekly } from '../recur';

const tz = 'America/Chicago';
const iso = (s: string) => new Date(s);

// Weekday convention throughout: JS getDay() — 0 = Sunday … 6 = Saturday,
// computed in the business time zone.

describe('expandWeekly across the 2026 US spring-forward (Mar 8)', () => {
  test('09:00 local stays 09:00 local; UTC offset shifts -6 -> -5', () => {
    // Sat Mar 7 2026 (weekday 6, CST) and Mon Mar 9 2026 (weekday 1, CDT).
    const out = expandWeekly({
      weekdays: [6, 1],
      localStart: '09:00',
      durationMin: 30,
      tz,
      from: iso('2026-03-06T00:00:00Z'),
      until: iso('2026-03-10T00:00:00Z'),
    });
    expect(out.map((o) => o.start.toISOString())).toEqual([
      '2026-03-07T15:00:00.000Z', // 09:00 CST (-06:00)
      '2026-03-09T14:00:00.000Z', // 09:00 CDT (-05:00)
    ]);
    expect(out.map((o) => o.end.toISOString())).toEqual([
      '2026-03-07T15:30:00.000Z',
      '2026-03-09T14:30:00.000Z',
    ]);
  });

  test('a visit AT 02:30 local on Mar 8 (nonexistent hour) resolves deterministically', () => {
    // 02:00–03:00 local does not exist on Mar 8 2026 in America/Chicago.
    // date-fns-tz v3 fromZonedTime resolves nonexistent wall times with the
    // POST-transition offset (CDT, -05:00): 02:30 -> 2026-03-08T07:30:00Z,
    // an instant that renders locally as 01:30 CST (one hour before the gap
    // closes). We pin that exact instant so a library change is caught.
    const out = expandWeekly({
      weekdays: [0], // Mar 8 2026 is a Sunday
      localStart: '02:30',
      durationMin: 60,
      tz,
      from: iso('2026-03-08T00:00:00Z'),
      until: iso('2026-03-09T00:00:00Z'),
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.start.toISOString()).toBe('2026-03-08T07:30:00.000Z');
    // Duration is absolute time, not wall-clock time.
    expect(out[0]!.end.getTime() - out[0]!.start.getTime()).toBe(60 * 60 * 1000);
  });
});

describe('expandWeekly across the 2026 US fall-back (Nov 1)', () => {
  test('09:00 local stays 09:00 local; UTC offset shifts -5 -> -6', () => {
    // Sat Oct 31 2026 (weekday 6, CDT) and Mon Nov 2 2026 (weekday 1, CST).
    const out = expandWeekly({
      weekdays: [6, 1],
      localStart: '09:00',
      durationMin: 30,
      tz,
      from: iso('2026-10-30T00:00:00Z'),
      until: iso('2026-11-03T00:00:00Z'),
    });
    expect(out.map((o) => o.start.toISOString())).toEqual([
      '2026-10-31T14:00:00.000Z', // 09:00 CDT (-05:00)
      '2026-11-02T15:00:00.000Z', // 09:00 CST (-06:00)
    ]);
  });

  test('a visit at 01:30 local on Nov 1 (ambiguous hour) takes the earlier occurrence', () => {
    // 01:00–02:00 local happens twice on Nov 1 2026. date-fns-tz v3 picks the
    // FIRST occurrence (still CDT, -05:00): 01:30 -> 2026-11-01T06:30:00Z.
    const out = expandWeekly({
      weekdays: [0], // Nov 1 2026 is a Sunday
      localStart: '01:30',
      durationMin: 30,
      tz,
      from: iso('2026-11-01T00:00:00Z'),
      until: iso('2026-11-02T00:00:00Z'),
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.start.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });
});

describe('expandWeekly weekday is the LOCAL weekday, not the UTC weekday', () => {
  test('a late-evening visit whose UTC date is the next day lands on the local weekday', () => {
    // Wed Jun 10 2026 22:30 America/Chicago (CDT) = Thu Jun 11 03:30Z.
    const window = {
      localStart: '22:30',
      durationMin: 30,
      tz,
      from: iso('2026-06-10T00:00:00Z'),
      until: iso('2026-06-11T12:00:00Z'),
    };
    // Asking for Wednesday (3) yields the instant that is Thursday in UTC.
    const wed = expandWeekly({ ...window, weekdays: [3] });
    expect(wed.map((o) => o.start.toISOString())).toEqual(['2026-06-11T03:30:00.000Z']);
    expect(wed[0]!.start.getUTCDay()).toBe(4); // Thursday in UTC — the divergence
    // Asking for Thursday (4) must NOT claim that instant.
    const thu = expandWeekly({ ...window, weekdays: [4] });
    expect(thu.map((o) => o.start.toISOString())).toEqual([]);
  });
});

describe('expandWeekly bounds', () => {
  // Half-open window: occurrences with from <= start < until.
  const args = {
    weekdays: [3], // Wed
    localStart: '09:00',
    durationMin: 30,
    tz,
  };
  const wedStart = iso('2026-06-10T14:00:00Z'); // Wed Jun 10 09:00 CDT

  test('from is inclusive: an occurrence exactly at from is returned', () => {
    const out = expandWeekly({ ...args, from: wedStart, until: iso('2026-06-11T00:00:00Z') });
    expect(out.map((o) => o.start.toISOString())).toEqual(['2026-06-10T14:00:00.000Z']);
  });

  test('until is exclusive: an occurrence exactly at until is not returned', () => {
    const out = expandWeekly({ ...args, from: iso('2026-06-09T00:00:00Z'), until: wedStart });
    expect(out).toEqual([]);
  });

  test('an occurrence 1 ms before from is excluded, 1 ms before until is included', () => {
    const before = expandWeekly({
      ...args,
      from: new Date(wedStart.getTime() + 1),
      until: iso('2026-06-11T00:00:00Z'),
    });
    expect(before).toEqual([]);
    const inside = expandWeekly({
      ...args,
      from: iso('2026-06-09T00:00:00Z'),
      until: new Date(wedStart.getTime() + 1),
    });
    expect(inside.map((o) => o.start.toISOString())).toEqual(['2026-06-10T14:00:00.000Z']);
  });

  test('multiple weeks and weekdays come back sorted ascending', () => {
    const out = expandWeekly({
      weekdays: [1, 5], // Mon, Fri
      localStart: '09:00',
      durationMin: 30,
      tz,
      from: iso('2026-06-01T00:00:00Z'),
      until: iso('2026-06-15T00:00:00Z'),
    });
    // Mon Jun 1, Fri Jun 5, Mon Jun 8, Fri Jun 12 — all 14:00Z (CDT).
    expect(out.map((o) => o.start.toISOString())).toEqual([
      '2026-06-01T14:00:00.000Z',
      '2026-06-05T14:00:00.000Z',
      '2026-06-08T14:00:00.000Z',
      '2026-06-12T14:00:00.000Z',
    ]);
    const times = out.map((o) => o.start.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  test('empty weekdays or an empty window yield no occurrences', () => {
    expect(
      expandWeekly({ ...args, weekdays: [], from: iso('2026-06-01T00:00:00Z'), until: iso('2026-07-01T00:00:00Z') }),
    ).toEqual([]);
    expect(
      expandWeekly({ ...args, from: iso('2026-06-11T00:00:00Z'), until: iso('2026-06-11T00:00:00Z') }),
    ).toEqual([]);
  });
});
