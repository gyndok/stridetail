import {
  declinedOffers,
  listPetNames,
  outOnWalks,
  PET_NAME_COLUMNS,
  petNamesLabel,
  startedAgoLabel,
  unassignedVisits,
  visitHref,
  walkPetIds,
} from '../operationsData';

// Supabase builder mock in the house pattern (see portal/__tests__/
// requestsApi.test.ts): every chained call is logged so tests pin the exact
// table, named columns, and filters — the column-grant rules make a drifting
// select a runtime 42501, so the shape IS the contract.
type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order']) {
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
});

// ---- pure selectors ----

test('unassignedVisits: unassigned only, ascending by start', () => {
  const rows = [
    { id: 'b', status: 'unassigned', scheduled_start: '2026-08-29T10:00:00Z' },
    { id: 'x', status: 'accepted', scheduled_start: '2026-08-28T10:00:00Z' },
    { id: 'a', status: 'unassigned', scheduled_start: '2026-08-28T09:00:00Z' },
    { id: 'y', status: 'in_progress', scheduled_start: '2026-08-27T10:00:00Z' },
  ];
  expect(unassignedVisits(rows).map((v) => v.id)).toEqual(['a', 'b']);
});

test('declinedOffers: declined-back-to-unassigned only (mobile Today rule)', () => {
  const rows = [
    { id: 'a', status: 'unassigned', decline_reason: 'Sick', scheduled_start: '2026-08-28T10:00:00Z' },
    // a re-offered visit keeps its old reason but is no longer attention
    { id: 'b', status: 'offered', decline_reason: 'Sick', scheduled_start: '2026-08-28T11:00:00Z' },
    { id: 'c', status: 'unassigned', decline_reason: null, scheduled_start: '2026-08-28T12:00:00Z' },
  ];
  expect(declinedOffers(rows).map((v) => v.id)).toEqual(['a']);
});

test('outOnWalks: in_progress only, soonest started first', () => {
  const rows = [
    {
      id: 'late',
      status: 'in_progress',
      scheduled_start: '2026-08-27T10:00:00Z',
      started_at: '2026-08-27T12:30:00Z',
    },
    { id: 'done', status: 'completed', scheduled_start: '2026-08-27T09:00:00Z', started_at: '2026-08-27T09:00:00Z' },
    {
      id: 'early',
      status: 'in_progress',
      scheduled_start: '2026-08-27T11:00:00Z',
      started_at: '2026-08-27T11:05:00Z',
    },
    // defensive: a null started_at falls back to the scheduled start
    { id: 'nostamp', status: 'in_progress', scheduled_start: '2026-08-27T10:00:00Z', started_at: null },
  ];
  expect(outOnWalks(rows).map((v) => v.id)).toEqual(['nostamp', 'early', 'late']);
});

test('visitHref: the owner visit screen', () => {
  expect(visitHref({ id: 'v1' })).toBe('/schedule/v1');
});

// ---- "started X min ago" formatter ----

const NOW = new Date('2026-08-27T12:00:00Z');

test('startedAgoLabel: minutes, hours, just-now, and defensive cases', () => {
  expect(startedAgoLabel(null, NOW)).toBe('in progress');
  expect(startedAgoLabel('2026-08-27T11:59:30Z', NOW)).toBe('started just now');
  expect(startedAgoLabel('2026-08-27T11:48:00Z', NOW)).toBe('started 12 min ago');
  expect(startedAgoLabel('2026-08-27T11:00:00Z', NOW)).toBe('started 1 h ago');
  expect(startedAgoLabel('2026-08-27T10:25:00Z', NOW)).toBe('started 1 h 35 min ago');
  // clock skew: a start stamped "in the future" never renders negative
  expect(startedAgoLabel('2026-08-27T12:00:40Z', NOW)).toBe('started just now');
});

// ---- pet names ----

test('walkPetIds: unique, sorted, across walks', () => {
  const walks = [{ pet_ids: ['p2', 'p1'] }, { pet_ids: ['p2', 'p3'] }, { pet_ids: [] }];
  expect(walkPetIds(walks)).toEqual(['p1', 'p2', 'p3']);
});

test('petNamesLabel: names when resolved, count fallback, empty when no pets', () => {
  expect(petNamesLabel(['p1', 'p2'], { p1: 'Fido', p2: 'Rex' })).toBe('Fido, Rex');
  expect(petNamesLabel(['p1', 'p2'], {})).toBe('2 pets');
  expect(petNamesLabel(['p1'], undefined)).toBe('1 pet');
  expect(petNamesLabel([], { p1: 'Fido' })).toBe('');
});

test('listPetNames: named columns, business scope, id set; empty ids never queries', async () => {
  await expect(listPetNames('b1', [])).resolves.toEqual({});
  expect(mockLog).toHaveLength(0);

  mockResult = {
    data: [
      { id: 'p1', name: 'Fido' },
      { id: 'p2', name: 'Rex' },
    ],
    error: null,
  };
  await expect(listPetNames('b1', ['p1', 'p2'])).resolves.toEqual({ p1: 'Fido', p2: 'Rex' });
  expect(mockLog[0]?.table).toBe('pets');
  expect(mockLog[0]?.steps).toEqual([
    ['select', [PET_NAME_COLUMNS]],
    ['eq', ['business_id', 'b1']],
    ['in', ['id', ['p1', 'p2']]],
  ]);
});

test('listPetNames: a supabase error throws', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listPetNames('b1', ['p1'])).rejects.toThrow('boom');
});
