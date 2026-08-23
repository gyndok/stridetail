import {
  buildNameSearch,
  createClient,
  embeddedCount,
  escapeIlike,
  firstPhone,
  getClient,
  isMeetGreetPending,
  listClients,
  petsCountLabel,
  updateClient,
} from '../api';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'ilike', 'order', 'insert', 'update', 'single']) {
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

function steps() {
  return mockLog[0]!.steps;
}
function names() {
  return steps().map(([n]) => n);
}
function argsOf(name: string) {
  return steps().filter(([n]) => n === name).map(([, a]) => a);
}

// ---- pure helpers ----

test('escapeIlike escapes %, _ and backslash', () => {
  expect(escapeIlike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  expect(escapeIlike('plain')).toBe('plain');
});

test('buildNameSearch trims and wraps in wildcards', () => {
  expect(buildNameSearch('  Ann  ')).toBe('%Ann%');
  expect(buildNameSearch('50%_off')).toBe('%50\\%\\_off%');
});

test('buildNameSearch returns null for blank input', () => {
  expect(buildNameSearch(undefined)).toBeNull();
  expect(buildNameSearch('')).toBeNull();
  expect(buildNameSearch('   ')).toBeNull();
});

test('isMeetGreetPending is true only while mg_completed_at is null', () => {
  expect(isMeetGreetPending({ mg_completed_at: null })).toBe(true);
  expect(isMeetGreetPending({ mg_completed_at: '2026-08-20T10:00:00Z' })).toBe(false);
});

test('embeddedCount unwraps the supabase count embed', () => {
  expect(embeddedCount([{ count: 3 }])).toBe(3);
  expect(embeddedCount([])).toBe(0);
  expect(embeddedCount(null)).toBe(0);
  expect(embeddedCount(undefined)).toBe(0);
});

test('petsCountLabel pluralizes', () => {
  expect(petsCountLabel(0)).toBe('No pets');
  expect(petsCountLabel(1)).toBe('1 pet');
  expect(petsCountLabel(2)).toBe('2 pets');
});

test('firstPhone returns the first phone or null', () => {
  expect(firstPhone(['555-1', '555-2'])).toBe('555-1');
  expect(firstPhone([])).toBeNull();
});

// ---- query shapes ----

test('listClients scopes by business, orders by name, no ilike without search', async () => {
  await listClients('b1');
  expect(mockLog[0]!.table).toBe('clients');
  expect(argsOf('eq')).toContainEqual(['business_id', 'b1']);
  expect(argsOf('order')[0]![0]).toBe('name');
  expect(names()).not.toContain('ilike');
});

test('listClients applies an escaped ilike on name when searching', async () => {
  await listClients('b1', ' Ann_% ');
  expect(argsOf('ilike')).toEqual([['name', '%Ann\\_\\%%']]);
});

test('listClients skips ilike for a whitespace-only search', async () => {
  await listClients('b1', '   ');
  expect(names()).not.toContain('ilike');
});

test('listClients throws on error', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listClients('b1')).rejects.toThrow('boom');
});

test('getClient scopes by business and id, embeds pets count, single row', async () => {
  mockResult = { data: { id: 'c1' }, error: null };
  await getClient('b1', 'c1');
  expect(mockLog[0]!.table).toBe('clients');
  expect(argsOf('select')[0]![0]).toContain('pets(count)');
  expect(argsOf('eq')).toContainEqual(['business_id', 'b1']);
  expect(argsOf('eq')).toContainEqual(['id', 'c1']);
  expect(names()).toContain('single');
});

test('createClient inserts with the business id attached', async () => {
  mockResult = { data: { id: 'c1' }, error: null };
  await createClient('b1', { name: 'Ann', phones: ['555'] });
  const [payload] = argsOf('insert')[0]!;
  expect(payload).toMatchObject({ business_id: 'b1', name: 'Ann', phones: ['555'] });
  expect(names()).toContain('single');
});

test('updateClient scopes the update by business and id', async () => {
  mockResult = { data: { id: 'c1' }, error: null };
  await updateClient('b1', 'c1', { name: 'Ann B' });
  expect(argsOf('update')[0]![0]).toMatchObject({ name: 'Ann B' });
  expect(argsOf('eq')).toContainEqual(['business_id', 'b1']);
  expect(argsOf('eq')).toContainEqual(['id', 'c1']);
});
