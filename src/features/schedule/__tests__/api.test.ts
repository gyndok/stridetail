import { buildWeeklyRRule, createSeries, seriesInsertRow } from '../api';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: null, error: null };
const mockInvoke = jest.fn(async () => ({ data: null, error: null }));

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'insert', 'update', 'single']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(mockResult));
      return builder;
    },
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...(args as [])),
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResult = { data: null, error: null };
  mockInvoke.mockClear();
});

const input = {
  businessId: 'b1',
  clientId: 'c1',
  serviceId: 's1',
  walkerId: 'w1',
  petIds: ['p1', 'p2'],
  weekdays: [1, 3, 5],
  localStart: '09:00',
  startsOn: '2026-09-01',
};

// ---- pure input shaping ----

test('buildWeeklyRRule sorts, dedupes, and maps to RFC 5545 codes', () => {
  expect(buildWeeklyRRule([5, 1, 3, 1])).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  expect(buildWeeklyRRule([0, 6])).toBe('FREQ=WEEKLY;BYDAY=SU,SA');
});

test('buildWeeklyRRule rejects empty and out-of-range weekday sets', () => {
  expect(() => buildWeeklyRRule([])).toThrow('at least one weekday');
  expect(() => buildWeeklyRRule([7])).toThrow('0-6');
  expect(() => buildWeeklyRRule([-1])).toThrow('0-6');
  expect(() => buildWeeklyRRule([1.5])).toThrow('0-6');
});

test('seriesInsertRow shapes camelCase input into the snake_case series row', () => {
  expect(seriesInsertRow(input)).toEqual({
    business_id: 'b1',
    client_id: 'c1',
    service_id: 's1',
    walker_id: 'w1',
    pet_ids: ['p1', 'p2'],
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    starts_on: '2026-09-01',
    ends_on: null,
    local_start: '09:00',
  });
  expect(seriesInsertRow({ ...input, endsOn: '2026-10-01' }).ends_on).toBe('2026-10-01');
});

test('seriesInsertRow validates localStart, dates, and date order', () => {
  expect(() => seriesInsertRow({ ...input, localStart: '9:00' })).toThrow('bad localStart');
  expect(() => seriesInsertRow({ ...input, localStart: '24:00' })).toThrow('bad localStart');
  expect(() => seriesInsertRow({ ...input, startsOn: '09/01/2026' })).toThrow('bad startsOn');
  expect(() => seriesInsertRow({ ...input, endsOn: 'nope' })).toThrow('bad endsOn');
  expect(() => seriesInsertRow({ ...input, endsOn: '2026-08-31' })).toThrow('before startsOn');
});

// ---- createSeries flow (supabase + function invocation mocked) ----

test('createSeries inserts the series then invokes expand-series with the new id', async () => {
  mockResult = { data: { id: 'series-1' }, error: null };
  const out = await createSeries(input);
  expect(out).toEqual({ id: 'series-1' });
  expect(mockLog[0]!.table).toBe('visit_series');
  expect(mockLog[0]!.steps.map(([n]) => n)).toEqual(['insert', 'select', 'single']);
  expect(mockInvoke).toHaveBeenCalledWith('expand-series', { body: { seriesId: 'series-1' } });
});

test('createSeries does not invoke the function when the insert fails', async () => {
  mockResult = { data: null, error: new Error('rls says no') };
  await expect(createSeries(input)).rejects.toThrow('rls says no');
  expect(mockInvoke).not.toHaveBeenCalled();
});
