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
  parseLocalDateTime,
  parseLocalTime,
  validateTimeOffRange,
  validateTimeRange,
  type AvailabilityRule,
} from '../api';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };
let mockSession: { user: { id: string } } | null = { user: { id: 'u1' } };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockSession } }),
    },
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'insert', 'delete', 'single']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(mockResult));
      return builder;
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResult = { data: [], error: null };
  mockSession = { user: { id: 'u1' } };
});

function steps() {
  return mockLog[0]!.steps;
}
function names() {
  return steps().map(([n]) => n);
}
function argsOf(name: string) {
  return steps().filter(([n]) => n === name).map(([, a]) => a);
}

// ---- parseLocalTime ----

test('parseLocalTime accepts zero-padded HH:MM within 00:00-23:59', () => {
  expect(parseLocalTime('09:30')).toBe('09:30');
  expect(parseLocalTime('00:00')).toBe('00:00');
  expect(parseLocalTime('23:59')).toBe('23:59');
});

test('parseLocalTime is lenient about a single-digit hour and whitespace', () => {
  expect(parseLocalTime('9:30')).toBe('09:30');
  expect(parseLocalTime(' 23:59 ')).toBe('23:59');
});

test('parseLocalTime rejects out-of-range and malformed input', () => {
  expect(parseLocalTime('24:00')).toBeNull();
  expect(parseLocalTime('12:60')).toBeNull();
  expect(parseLocalTime('9:5')).toBeNull();
  expect(parseLocalTime('930')).toBeNull();
  expect(parseLocalTime('ab:cd')).toBeNull();
  expect(parseLocalTime('')).toBeNull();
  expect(parseLocalTime('09:30:00')).toBeNull();
});

// ---- validateTimeRange ----

test('validateTimeRange canonicalizes a valid start < end pair', () => {
  expect(validateTimeRange('9:00', '17:30')).toEqual({ ok: true, start: '09:00', end: '17:30' });
});

test('validateTimeRange rejects equal or inverted ranges (same-day only)', () => {
  expect(validateTimeRange('09:00', '09:00')).toEqual({ ok: false, error: 'End must be after start' });
  expect(validateTimeRange('17:00', '09:00')).toEqual({ ok: false, error: 'End must be after start' });
});

test('validateTimeRange reports malformed times', () => {
  expect(validateTimeRange('nope', '17:00')).toEqual({ ok: false, error: 'Enter times as HH:MM' });
  expect(validateTimeRange('09:00', '25:00')).toEqual({ ok: false, error: 'Enter times as HH:MM' });
});

// ---- parseLocalDateTime ----

test('parseLocalDateTime converts business-tz wall time to a UTC instant', () => {
  const d = parseLocalDateTime('2026-08-24 09:00', 'America/Chicago');
  expect(d?.toISOString()).toBe('2026-08-24T14:00:00.000Z'); // 09:00 CDT
});

test('parseLocalDateTime is lenient about a single-digit hour', () => {
  const d = parseLocalDateTime('2026-08-24 9:00', 'America/Chicago');
  expect(d?.toISOString()).toBe('2026-08-24T14:00:00.000Z');
});

test('parseLocalDateTime resolves a spring-forward gap with the post-transition offset', () => {
  // Same pin as src/lib/schedule/recur.test.ts: 02:30 on 2026-03-08 does not exist in Chicago.
  const d = parseLocalDateTime('2026-03-08 02:30', 'America/Chicago');
  expect(d?.toISOString()).toBe('2026-03-08T07:30:00.000Z');
});

test('parseLocalDateTime rejects impossible calendar dates and malformed input', () => {
  expect(parseLocalDateTime('2026-02-30 10:00', 'America/Chicago')).toBeNull();
  expect(parseLocalDateTime('2026-8-24 09:00', 'America/Chicago')).toBeNull();
  expect(parseLocalDateTime('2026-08-24T09:00', 'America/Chicago')).toBeNull();
  expect(parseLocalDateTime('2026-08-24 24:00', 'America/Chicago')).toBeNull();
  expect(parseLocalDateTime('garbage', 'America/Chicago')).toBeNull();
});

// ---- validateTimeOffRange ----

test('validateTimeOffRange returns UTC instants for a valid pair', () => {
  const r = validateTimeOffRange('2026-08-24 09:00', '2026-08-25 17:00', 'America/Chicago');
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.startsAt.toISOString()).toBe('2026-08-24T14:00:00.000Z');
    expect(r.endsAt.toISOString()).toBe('2026-08-25T22:00:00.000Z');
  }
});

test('validateTimeOffRange rejects end at or before start', () => {
  expect(validateTimeOffRange('2026-08-24 09:00', '2026-08-24 09:00', 'America/Chicago')).toEqual({
    ok: false,
    error: 'End must be after start',
  });
  expect(validateTimeOffRange('2026-08-25 09:00', '2026-08-24 09:00', 'America/Chicago')).toEqual({
    ok: false,
    error: 'End must be after start',
  });
});

test('validateTimeOffRange reports which field is malformed', () => {
  expect(validateTimeOffRange('nope', '2026-08-24 09:00', 'America/Chicago')).toEqual({
    ok: false,
    error: 'Enter the start as YYYY-MM-DD HH:MM',
  });
  expect(validateTimeOffRange('2026-08-24 09:00', 'nope', 'America/Chicago')).toEqual({
    ok: false,
    error: 'Enter the end as YYYY-MM-DD HH:MM',
  });
});

// ---- display helpers ----

test('formatLocalTime trims seconds from a time column value', () => {
  expect(formatLocalTime('09:00:00')).toBe('09:00');
  expect(formatLocalTime('09:00')).toBe('09:00');
});

test('formatTimeOffRange renders in the business tz, once per day when same-day', () => {
  expect(
    formatTimeOffRange('2026-08-24T14:00:00Z', '2026-08-24T19:00:00Z', 'America/Chicago'),
  ).toBe('Aug 24, 2026 09:00 – 14:00');
});

test('formatTimeOffRange repeats the date across days', () => {
  expect(
    formatTimeOffRange('2026-08-24T14:00:00Z', '2026-08-25T19:00:00Z', 'America/Chicago'),
  ).toBe('Aug 24, 2026 09:00 – Aug 25, 2026 14:00');
});

// ---- groupRulesByWeekday ----

function rule(id: string, weekday: number, start: string, end: string): AvailabilityRule {
  return {
    id,
    user_id: 'u1',
    business_id: 'b1',
    weekday,
    start_local: start,
    end_local: end,
    created_at: '2026-08-24T00:00:00Z',
  };
}

test('groupRulesByWeekday buckets Sun-Sat and sorts each day by start', () => {
  const grouped = groupRulesByWeekday([
    rule('r3', 1, '14:00:00', '17:00:00'),
    rule('r1', 1, '09:00:00', '12:00:00'),
    rule('r2', 6, '08:00:00', '10:00:00'),
  ]);
  expect(grouped).toHaveLength(7);
  expect(grouped[0]).toEqual([]);
  expect(grouped[1]!.map((r) => r.id)).toEqual(['r1', 'r3']);
  expect(grouped[6]!.map((r) => r.id)).toEqual(['r2']);
});

test('WEEKDAY_LABELS follows the JS getDay convention', () => {
  expect(WEEKDAY_LABELS).toHaveLength(7);
  expect(WEEKDAY_LABELS[0]).toBe('Sunday');
  expect(WEEKDAY_LABELS[6]).toBe('Saturday');
});

// ---- query shapes: availability ----

test('listMyAvailability scopes by business and the session user, ordered by weekday then start', async () => {
  await listMyAvailability('b1');
  expect(mockLog[0]!.table).toBe('availability_rules');
  expect(argsOf('eq')).toContainEqual(['business_id', 'b1']);
  expect(argsOf('eq')).toContainEqual(['user_id', 'u1']);
  expect(argsOf('order').map((a) => a[0])).toEqual(['weekday', 'start_local']);
});

test('listMyAvailability returns [] when signed out', async () => {
  mockSession = null;
  await expect(listMyAvailability('b1')).resolves.toEqual([]);
  expect(mockLog).toHaveLength(0);
});

test('addRule inserts canonical times with the session user id', async () => {
  mockResult = { data: { id: 'r1' }, error: null };
  await addRule('b1', 1, '9:00', '17:30');
  expect(mockLog[0]!.table).toBe('availability_rules');
  const [payload] = argsOf('insert')[0]!;
  expect(payload).toEqual({
    user_id: 'u1',
    business_id: 'b1',
    weekday: 1,
    start_local: '09:00',
    end_local: '17:30',
  });
  expect(names()).toContain('single');
});

test('addRule throws on an invalid or inverted range', async () => {
  await expect(addRule('b1', 1, 'nope', '17:00')).rejects.toThrow('Enter times as HH:MM');
  await expect(addRule('b1', 1, '17:00', '09:00')).rejects.toThrow('End must be after start');
  expect(mockLog).toHaveLength(0);
});

test('addRule throws when signed out', async () => {
  mockSession = null;
  await expect(addRule('b1', 1, '09:00', '17:00')).rejects.toThrow('not signed in');
});

test('deleteRule deletes by id', async () => {
  await deleteRule('r1');
  expect(mockLog[0]!.table).toBe('availability_rules');
  expect(names()).toContain('delete');
  expect(argsOf('eq')).toContainEqual(['id', 'r1']);
});

// ---- query shapes: time off ----

test('listMyTimeOff scopes by business and the session user, ordered by starts_at', async () => {
  await listMyTimeOff('b1');
  expect(mockLog[0]!.table).toBe('time_off');
  expect(argsOf('eq')).toContainEqual(['business_id', 'b1']);
  expect(argsOf('eq')).toContainEqual(['user_id', 'u1']);
  expect(argsOf('order')[0]![0]).toBe('starts_at');
});

test('listMyTimeOff returns [] when signed out', async () => {
  mockSession = null;
  await expect(listMyTimeOff('b1')).resolves.toEqual([]);
  expect(mockLog).toHaveLength(0);
});

test('addTimeOff inserts ISO instants with a trimmed reason', async () => {
  mockResult = { data: { id: 't1' }, error: null };
  await addTimeOff('b1', new Date('2026-08-24T14:00:00Z'), new Date('2026-08-25T22:00:00Z'), '  vacation  ');
  expect(mockLog[0]!.table).toBe('time_off');
  const [payload] = argsOf('insert')[0]!;
  expect(payload).toEqual({
    user_id: 'u1',
    business_id: 'b1',
    starts_at: '2026-08-24T14:00:00.000Z',
    ends_at: '2026-08-25T22:00:00.000Z',
    reason: 'vacation',
  });
});

test('addTimeOff stores a blank reason as null', async () => {
  mockResult = { data: { id: 't1' }, error: null };
  await addTimeOff('b1', new Date('2026-08-24T14:00:00Z'), new Date('2026-08-24T15:00:00Z'), '   ');
  const [payload] = argsOf('insert')[0]!;
  expect(payload).toMatchObject({ reason: null });
});

test('addTimeOff throws when end is not after start', async () => {
  const at = new Date('2026-08-24T14:00:00Z');
  await expect(addTimeOff('b1', at, at, null)).rejects.toThrow('End must be after start');
  expect(mockLog).toHaveLength(0);
});

test('deleteTimeOff deletes by id', async () => {
  await deleteTimeOff('t1');
  expect(mockLog[0]!.table).toBe('time_off');
  expect(names()).toContain('delete');
  expect(argsOf('eq')).toContainEqual(['id', 't1']);
});

test('list functions throw on error', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listMyAvailability('b1')).rejects.toThrow('boom');
});
