import { createService, listServices, updateService } from '../api';

import type { ServiceInput } from '../types';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };

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
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResult = { data: [], error: null };
});

function steps() {
  return mockLog[0]!.steps;
}
function argsOf(name: string) {
  return steps()
    .filter(([n]) => n === name)
    .map(([, a]) => a);
}

const input: ServiceInput = {
  name: 'Walk',
  kind: 'walk',
  duration_min: 30,
  base_price_cents: 2500,
  extra_pet_price_cents: 500,
  requires_gps: true,
  active: true,
};

test('listServices scopes to the business and orders active-first then name', async () => {
  await listServices('biz-1');
  expect(mockLog[0]!.table).toBe('services');
  expect(argsOf('eq')).toEqual([['business_id', 'biz-1']]);
  expect(argsOf('order')).toEqual([
    ['active', { ascending: false }],
    ['name'],
  ]);
});

test('listServices throws on error', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listServices('biz-1')).rejects.toThrow('boom');
});

test('createService inserts with the business id and returns the row', async () => {
  mockResult = { data: { id: 's1' }, error: null };
  const row = await createService('biz-1', input);
  expect(mockLog[0]!.table).toBe('services');
  expect(argsOf('insert')).toEqual([[{ ...input, business_id: 'biz-1' }]]);
  expect(steps().map(([n]) => n)).toContain('single');
  expect(row).toEqual({ id: 's1' });
});

test('updateService scopes the update to business and id', async () => {
  mockResult = { data: { id: 's1' }, error: null };
  await updateService('biz-1', 's1', { active: false });
  expect(argsOf('update')).toEqual([[{ active: false }]]);
  expect(argsOf('eq')).toEqual([
    ['business_id', 'biz-1'],
    ['id', 's1'],
  ]);
});
