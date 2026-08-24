import { inTimeOff, overlaps, withinAvailability } from '../conflicts';

const tz = 'America/Chicago';
const iso = (s: string) => new Date(s);

describe('overlaps', () => {
  const a = iso('2026-06-10T14:00:00Z');
  const b = iso('2026-06-10T14:30:00Z');
  const c = iso('2026-06-10T15:00:00Z');
  const d = iso('2026-06-10T15:30:00Z');

  test('disjoint intervals do not overlap', () => {
    expect(overlaps(a, b, c, d)).toBe(false);
    expect(overlaps(c, d, a, b)).toBe(false);
  });

  test('touching intervals (end === start) do not overlap', () => {
    expect(overlaps(a, b, b, c)).toBe(false);
    expect(overlaps(b, c, a, b)).toBe(false);
  });

  test('partial overlap in either order', () => {
    expect(overlaps(a, c, b, d)).toBe(true);
    expect(overlaps(b, d, a, c)).toBe(true);
  });

  test('containment and identity overlap', () => {
    expect(overlaps(a, d, b, c)).toBe(true);
    expect(overlaps(b, c, a, d)).toBe(true);
    expect(overlaps(a, b, a, b)).toBe(true);
  });
});

describe('withinAvailability', () => {
  // Wed Jun 10 2026 09:00–09:30 America/Chicago (CDT) = 14:00–14:30Z.
  const wedStart = iso('2026-06-10T14:00:00Z');
  const wedEnd = iso('2026-06-10T14:30:00Z');

  test('visit inside a matching weekday rule', () => {
    const rules = [{ weekday: 3, start_local: '08:00', end_local: '18:00' }];
    expect(withinAvailability(wedStart, wedEnd, rules, tz)).toBe(true);
  });

  test('no rule for that weekday', () => {
    const rules = [{ weekday: 4, start_local: '08:00', end_local: '18:00' }];
    expect(withinAvailability(wedStart, wedEnd, rules, tz)).toBe(false);
  });

  test('empty rules mean never available', () => {
    expect(withinAvailability(wedStart, wedEnd, [], tz)).toBe(false);
  });

  test('boundaries are inclusive: a visit exactly filling the rule fits', () => {
    const rules = [{ weekday: 3, start_local: '09:00', end_local: '09:30' }];
    expect(withinAvailability(wedStart, wedEnd, rules, tz)).toBe(true);
  });

  test('starting before or ending after the rule fails', () => {
    const rules = [{ weekday: 3, start_local: '09:01', end_local: '18:00' }];
    expect(withinAvailability(wedStart, wedEnd, rules, tz)).toBe(false);
    const rules2 = [{ weekday: 3, start_local: '08:00', end_local: '09:29' }];
    expect(withinAvailability(wedStart, wedEnd, rules2, tz)).toBe(false);
  });

  test('weekday and times are computed in the business tz, not UTC', () => {
    // Wed Jun 10 2026 22:00–22:30 Chicago = Thu Jun 11 03:00–03:30Z.
    const s = iso('2026-06-11T03:00:00Z');
    const e = iso('2026-06-11T03:30:00Z');
    // A Wednesday-evening rule matches …
    expect(withinAvailability(s, e, [{ weekday: 3, start_local: '21:00', end_local: '23:00' }], tz)).toBe(true);
    // … a Thursday rule at the same local hours does not.
    expect(withinAvailability(s, e, [{ weekday: 4, start_local: '21:00', end_local: '23:00' }], tz)).toBe(false);
  });

  test('postgres time strings with seconds are accepted', () => {
    const rules = [{ weekday: 3, start_local: '08:00:00', end_local: '18:00:00' }];
    expect(withinAvailability(wedStart, wedEnd, rules, tz)).toBe(true);
  });

  test('a visit crossing local midnight is never within availability', () => {
    // Wed Jun 10 2026 23:30 – Thu Jun 11 00:30 Chicago = Jun 11 04:30–05:30Z.
    // Rules are same-local-day ranges (DB enforces end_local > start_local), so a
    // visit spanning two local dates cannot fit any rule — even back-to-back ones.
    const s = iso('2026-06-11T04:30:00Z');
    const e = iso('2026-06-11T05:30:00Z');
    const rules = [
      { weekday: 3, start_local: '00:00', end_local: '23:59' },
      { weekday: 4, start_local: '00:00', end_local: '23:59' },
    ];
    expect(withinAvailability(s, e, rules, tz)).toBe(false);
  });

  test('midnight-crossing rules are not supported: an inverted range matches nothing', () => {
    // The DB check constraint (end_local > start_local) forbids these; if one ever
    // reaches the client, it matches nothing rather than wrapping around midnight.
    const rules = [{ weekday: 3, start_local: '22:00', end_local: '02:00' }];
    const s = iso('2026-06-11T04:00:00Z'); // Wed Jun 10 23:00 Chicago
    const e = iso('2026-06-11T04:30:00Z');
    expect(withinAvailability(s, e, rules, tz)).toBe(false);
  });
});

describe('inTimeOff', () => {
  const s = iso('2026-06-10T14:00:00Z');
  const e = iso('2026-06-10T14:30:00Z');

  test('visit overlapping a time-off block', () => {
    const off = [{ starts_at: '2026-06-10T14:15:00Z', ends_at: '2026-06-10T15:00:00Z' }];
    expect(inTimeOff(s, e, off)).toBe(true);
  });

  test('visit fully inside a time-off block', () => {
    const off = [{ starts_at: '2026-06-09T00:00:00Z', ends_at: '2026-06-12T00:00:00Z' }];
    expect(inTimeOff(s, e, off)).toBe(true);
  });

  test('visit outside every block, and touching does not count', () => {
    const off = [
      { starts_at: '2026-06-10T13:00:00Z', ends_at: '2026-06-10T14:00:00Z' }, // ends as visit starts
      { starts_at: '2026-06-10T14:30:00Z', ends_at: '2026-06-10T15:00:00Z' }, // starts as visit ends
    ];
    expect(inTimeOff(s, e, off)).toBe(false);
    expect(inTimeOff(s, e, [])).toBe(false);
  });

  test('Date objects are accepted too', () => {
    const off = [{ starts_at: iso('2026-06-10T14:15:00Z'), ends_at: iso('2026-06-10T15:00:00Z') }];
    expect(inTimeOff(s, e, off)).toBe(true);
  });
});
