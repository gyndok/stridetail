import Storage from 'expo-sqlite/kv-store';

import {
  PERSIST_KEY_PREFIXES,
  PERSIST_MAX_AGE_MS,
  persistOptions,
  queryPersister,
  shouldPersistQuery,
} from '../queryPersister';

type FakeQuery = Parameters<
  NonNullable<NonNullable<typeof persistOptions.dehydrateOptions>['shouldDehydrateQuery']>
>[0];

const fakeQuery = (queryKey: unknown[], status: 'success' | 'pending' | 'error' = 'success') =>
  ({ queryKey, state: { status } }) as unknown as FakeQuery;

const dehydrate = persistOptions.dehydrateOptions!.shouldDehydrateQuery!;

describe('shouldPersistQuery whitelist', () => {
  test.each([...PERSIST_KEY_PREFIXES])('persists %s-prefixed keys', (prefix) => {
    expect(shouldPersistQuery([prefix, 'b1', 'extra'])).toBe(true);
  });

  test.each([
    ['client-access-flag', 'c1'], // access codes flag — never persisted
    ['access', 'anything'],
    ['client', 'b1', 'c1'], // singular detail keys are not whitelisted
    ['pet', 'b1', 'p1'],
    ['visit', 'b1', 'v1'],
    ['pet-photo', 'path'],
    ['pickerCtx', 'b1'],
  ])('never persists %s keys', (...key) => {
    expect(shouldPersistQuery(key)).toBe(false);
  });

  test('non-string and empty heads are never persisted', () => {
    expect(shouldPersistQuery([])).toBe(false);
    expect(shouldPersistQuery([42, 'visits'])).toBe(false);
    expect(shouldPersistQuery([{ scope: 'visits' }])).toBe(false);
  });

  test('no access-related prefix is in the whitelist', () => {
    for (const p of PERSIST_KEY_PREFIXES) expect(p.toLowerCase()).not.toContain('access');
  });
});

describe('persistOptions', () => {
  test('maxAge is 48 hours', () => {
    expect(persistOptions.maxAge).toBe(48 * 60 * 60 * 1000);
    expect(PERSIST_MAX_AGE_MS).toBe(172_800_000);
  });

  test('dehydrates only successful whitelisted queries', () => {
    expect(dehydrate(fakeQuery(['visits', 'b1', 'todayPlus']))).toBe(true);
    expect(dehydrate(fakeQuery(['myVisits', 'b1']))).toBe(true);
    expect(dehydrate(fakeQuery(['visits', 'b1'], 'pending'))).toBe(false);
    expect(dehydrate(fakeQuery(['visits', 'b1'], 'error'))).toBe(false);
    expect(dehydrate(fakeQuery(['client-access-flag', 'c1']))).toBe(false);
  });

  test('persister reads and writes through the kv-store under one cache key', async () => {
    (Storage.getItem as jest.Mock).mockResolvedValueOnce(null);
    await queryPersister.restoreClient();
    expect(Storage.getItem).toHaveBeenCalledWith('stridetail-query-cache');
    await queryPersister.removeClient();
    expect(Storage.removeItem).toHaveBeenCalledWith('stridetail-query-cache');
  });
});
