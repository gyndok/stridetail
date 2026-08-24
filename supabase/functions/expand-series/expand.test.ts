// Deno tests for the expand-series weekly expansion.
// Run: deno test supabase/functions/expand-series/expand.test.ts
//
// The vectors below are COPIED from src/lib/schedule/__tests__/recur.test.ts so
// the app-side (date-fns-tz) and edge-side (dependency-free) implementations
// stay pinned to identical semantics. Change one file -> change both.
//
// DST vector table (tz = America/Chicago, weekdays are LOCAL getDay() 0=Sun..6=Sat):
// | # | weekdays | localStart | durMin | from (UTC)            | until (UTC)           | expected starts (UTC)                          |
// |---|----------|------------|--------|-----------------------|-----------------------|------------------------------------------------|
// | 1 | [6,1]    | 09:00      | 30     | 2026-03-06T00:00:00Z  | 2026-03-10T00:00:00Z  | 2026-03-07T15:00:00Z (CST), 2026-03-09T14:00:00Z (CDT) |
// | 2 | [0]      | 02:30      | 60     | 2026-03-08T00:00:00Z  | 2026-03-09T00:00:00Z  | 2026-03-08T07:30:00Z (nonexistent hour -> POST-transition offset) |
// | 3 | [6,1]    | 09:00      | 30     | 2026-10-30T00:00:00Z  | 2026-11-03T00:00:00Z  | 2026-10-31T14:00:00Z (CDT), 2026-11-02T15:00:00Z (CST) |
// | 4 | [0]      | 01:30      | 30     | 2026-11-01T00:00:00Z  | 2026-11-02T00:00:00Z  | 2026-11-01T06:30:00Z (ambiguous hour -> FIRST occurrence) |
// | 5 | [3]      | 22:30      | 30     | 2026-06-10T00:00:00Z  | 2026-06-11T12:00:00Z  | 2026-06-11T03:30:00Z (local Wed, UTC Thu); weekdays [4] -> [] |
// | 6 | [1,5]    | 09:00      | 30     | 2026-06-01T00:00:00Z  | 2026-06-15T00:00:00Z  | Jun 1, 5, 8, 12 all 14:00:00Z, sorted ascending |
import { assertEquals } from 'jsr:@std/assert@1';

import { expandWeekly, parseWeeklyRRule } from './expand.ts';

const tz = 'America/Chicago';
const iso = (s: string) => new Date(s);
const starts = (out: { start: Date }[]) => out.map((o) => o.start.toISOString());
const ends = (out: { end: Date }[]) => out.map((o) => o.end.toISOString());

Deno.test('vector 1 — spring-forward: 09:00 local stays 09:00 local; offset -6 -> -5', () => {
  const out = expandWeekly({
    weekdays: [6, 1],
    localStart: '09:00',
    durationMin: 30,
    tz,
    from: iso('2026-03-06T00:00:00Z'),
    until: iso('2026-03-10T00:00:00Z'),
  });
  assertEquals(starts(out), ['2026-03-07T15:00:00.000Z', '2026-03-09T14:00:00.000Z']);
  assertEquals(ends(out), ['2026-03-07T15:30:00.000Z', '2026-03-09T14:30:00.000Z']);
});

Deno.test('vector 2 — nonexistent 02:30 on Mar 8 resolves with the post-transition offset', () => {
  const out = expandWeekly({
    weekdays: [0],
    localStart: '02:30',
    durationMin: 60,
    tz,
    from: iso('2026-03-08T00:00:00Z'),
    until: iso('2026-03-09T00:00:00Z'),
  });
  assertEquals(out.length, 1);
  assertEquals(out[0]!.start.toISOString(), '2026-03-08T07:30:00.000Z');
  // Duration is absolute time, not wall-clock time.
  assertEquals(out[0]!.end.getTime() - out[0]!.start.getTime(), 60 * 60 * 1000);
});

Deno.test('vector 3 — fall-back: 09:00 local stays 09:00 local; offset -5 -> -6', () => {
  const out = expandWeekly({
    weekdays: [6, 1],
    localStart: '09:00',
    durationMin: 30,
    tz,
    from: iso('2026-10-30T00:00:00Z'),
    until: iso('2026-11-03T00:00:00Z'),
  });
  assertEquals(starts(out), ['2026-10-31T14:00:00.000Z', '2026-11-02T15:00:00.000Z']);
});

Deno.test('vector 4 — ambiguous 01:30 on Nov 1 takes the earlier occurrence', () => {
  const out = expandWeekly({
    weekdays: [0],
    localStart: '01:30',
    durationMin: 30,
    tz,
    from: iso('2026-11-01T00:00:00Z'),
    until: iso('2026-11-02T00:00:00Z'),
  });
  assertEquals(out.length, 1);
  assertEquals(out[0]!.start.toISOString(), '2026-11-01T06:30:00.000Z');
});

Deno.test('vector 5 — weekday is the LOCAL weekday, not the UTC weekday', () => {
  const window = {
    localStart: '22:30',
    durationMin: 30,
    tz,
    from: iso('2026-06-10T00:00:00Z'),
    until: iso('2026-06-11T12:00:00Z'),
  };
  const wed = expandWeekly({ ...window, weekdays: [3] });
  assertEquals(starts(wed), ['2026-06-11T03:30:00.000Z']);
  assertEquals(wed[0]!.start.getUTCDay(), 4); // Thursday in UTC — the divergence
  const thu = expandWeekly({ ...window, weekdays: [4] });
  assertEquals(starts(thu), []);
});

Deno.test('vector 6 — multiple weeks and weekdays come back sorted ascending', () => {
  const out = expandWeekly({
    weekdays: [1, 5],
    localStart: '09:00',
    durationMin: 30,
    tz,
    from: iso('2026-06-01T00:00:00Z'),
    until: iso('2026-06-15T00:00:00Z'),
  });
  assertEquals(starts(out), [
    '2026-06-01T14:00:00.000Z',
    '2026-06-05T14:00:00.000Z',
    '2026-06-08T14:00:00.000Z',
    '2026-06-12T14:00:00.000Z',
  ]);
});

Deno.test('bounds — half-open window: from inclusive, until exclusive, 1 ms either side', () => {
  const args = { weekdays: [3], localStart: '09:00', durationMin: 30, tz };
  const wedStart = iso('2026-06-10T14:00:00Z'); // Wed Jun 10 09:00 CDT
  assertEquals(
    starts(expandWeekly({ ...args, from: wedStart, until: iso('2026-06-11T00:00:00Z') })),
    ['2026-06-10T14:00:00.000Z'],
  );
  assertEquals(expandWeekly({ ...args, from: iso('2026-06-09T00:00:00Z'), until: wedStart }), []);
  assertEquals(
    expandWeekly({ ...args, from: new Date(wedStart.getTime() + 1), until: iso('2026-06-11T00:00:00Z') }),
    [],
  );
  assertEquals(
    starts(expandWeekly({ ...args, from: iso('2026-06-09T00:00:00Z'), until: new Date(wedStart.getTime() + 1) })),
    ['2026-06-10T14:00:00.000Z'],
  );
});

Deno.test('bounds — empty weekdays or an empty window yield no occurrences', () => {
  const args = { weekdays: [3], localStart: '09:00', durationMin: 30, tz };
  assertEquals(
    expandWeekly({ ...args, weekdays: [], from: iso('2026-06-01T00:00:00Z'), until: iso('2026-07-01T00:00:00Z') }),
    [],
  );
  assertEquals(
    expandWeekly({ ...args, from: iso('2026-06-11T00:00:00Z'), until: iso('2026-06-11T00:00:00Z') }),
    [],
  );
});

Deno.test('localStart accepts the Postgres time form HH:MM:SS', () => {
  const out = expandWeekly({
    weekdays: [3],
    localStart: '09:00:00',
    durationMin: 30,
    tz,
    from: iso('2026-06-09T00:00:00Z'),
    until: iso('2026-06-11T00:00:00Z'),
  });
  assertEquals(starts(out), ['2026-06-10T14:00:00.000Z']);
});

Deno.test('parseWeeklyRRule — canonical form, tolerance, and rejection', () => {
  assertEquals(parseWeeklyRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR'), [1, 3, 5]);
  assertEquals(parseWeeklyRRule('byday=fr,mo;freq=weekly'), [1, 5]); // order/case tolerated
  assertEquals(parseWeeklyRRule('FREQ=WEEKLY;BYDAY=SU,SU,SA'), [0, 6]); // deduped, sorted
  assertEquals(parseWeeklyRRule('FREQ=DAILY;BYDAY=MO'), null);
  assertEquals(parseWeeklyRRule('FREQ=WEEKLY'), null);
  assertEquals(parseWeeklyRRule('FREQ=WEEKLY;BYDAY=XX'), null);
  assertEquals(parseWeeklyRRule(''), null);
});
