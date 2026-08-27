import {
  getPortalPet,
  listPortalPetCards,
  PORTAL_PET_CARD_COLUMNS,
  PORTAL_PET_DETAIL_COLUMNS,
  updatePortalPet,
  uploadPortalPetPhoto,
  type PortalPetPatch,
} from '../petsApi';
import { hasClientAccessSelf, revealClientAccessSelf, setClientAccessSelf } from '../accessApi';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };
const mockUpload = jest.fn(async (..._args: unknown[]) => ({ data: { path: 'x' }, error: null }));
const mockRpc = jest.fn(async (..._args: unknown[]): Promise<{ data: unknown; error: unknown }> => ({
  data: null,
  error: null,
}));

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit', 'update', 'single']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(mockResult));
      return builder;
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
    storage: {
      from: (bucket: string) => ({
        upload: (...args: unknown[]) => mockUpload(bucket, ...args),
      }),
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResult = { data: [], error: null };
  jest.clearAllMocks();
});

/**
 * Task 4's column contract (portalQueries.test.ts) extended to the Task 6
 * selects, plus the write-side contract: a portal pets UPDATE carries EXACTLY
 * the self-service columns — the server trigger raises on anything else, so a
 * stray key here would break every save.
 */
const FORBIDDEN = /price_cents_snapshot|owner_notes_md|decline_reason|private_notes_md/;
const SELF_SERVICE_PATCH_KEYS = [
  'feeding_md',
  'reactivity_md',
  'vet_name',
  'vet_phone',
  'vet_address',
];

const fullPatch: PortalPetPatch = {
  feeding_md: '2 cups',
  reactivity_md: 'shy with big dogs',
  vet_name: 'Dr. Lin',
  vet_phone: '555-0101',
  vet_address: '1 Vet Way',
};

test('pet column constants exclude the forbidden columns', () => {
  expect(PORTAL_PET_CARD_COLUMNS).not.toMatch(FORBIDDEN);
  expect(PORTAL_PET_DETAIL_COLUMNS).not.toMatch(FORBIDDEN);
});

test('listPortalPetCards: named columns, client scope, by name', async () => {
  await listPortalPetCards('c1');
  expect(mockLog[0]?.table).toBe('pets');
  expect(mockLog[0]?.steps).toEqual([
    ['select', [PORTAL_PET_CARD_COLUMNS]],
    ['eq', ['client_id', 'c1']],
    ['order', ['name', { ascending: true }]],
  ]);
});

test('getPortalPet: scoped to BOTH the client and the pet id', async () => {
  mockResult = { data: { id: 'p1' }, error: null };
  await getPortalPet('c1', 'p1');
  expect(mockLog[0]?.table).toBe('pets');
  expect(mockLog[0]?.steps).toEqual([
    ['select', [PORTAL_PET_DETAIL_COLUMNS]],
    ['eq', ['client_id', 'c1']],
    ['eq', ['id', 'p1']],
    ['single', []],
  ]);
});

test('updatePortalPet: payload carries exactly the self-service columns', async () => {
  mockResult = { data: { id: 'p1' }, error: null };
  await updatePortalPet('c1', 'p1', fullPatch);
  expect(mockLog[0]?.table).toBe('pets');
  expect(mockLog[0]?.steps).toEqual([
    ['update', [fullPatch]],
    ['eq', ['client_id', 'c1']],
    ['eq', ['id', 'p1']],
    ['select', [PORTAL_PET_DETAIL_COLUMNS]],
    ['single', []],
  ]);
  const payload = mockLog[0]?.steps[0]?.[1]?.[0] as Record<string, unknown>;
  expect(Object.keys(payload).sort()).toEqual([...SELF_SERVICE_PATCH_KEYS].sort());
});

test('uploadPortalPetPhoto: tenant-scoped path, upsert, photo_path-only update', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => ({
    arrayBuffer: async () => new ArrayBuffer(4),
  })) as unknown as typeof fetch;
  try {
    mockResult = { data: { id: 'p1' }, error: null };
    await uploadPortalPetPhoto({ id: 'p1', client_id: 'c1', business_id: 'b1' }, 'file://pic.jpg');
    expect(mockUpload).toHaveBeenCalledWith('media', 'b1/pets/p1/photo.jpg', expect.anything(), {
      contentType: 'image/jpeg',
      upsert: true,
    });
    expect(mockLog[0]?.table).toBe('pets');
    expect(mockLog[0]?.steps[0]).toEqual(['update', [{ photo_path: 'b1/pets/p1/photo.jpg' }]]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('pet queries surface supabase errors', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listPortalPetCards('c1')).rejects.toThrow('boom');
  await expect(updatePortalPet('c1', 'p1', fullPatch)).rejects.toThrow('boom');
});

// ===== access-code self RPC wrappers =====

test('setClientAccessSelf: full param set, blank fields stored as null', async () => {
  await setClientAccessSelf('c1', {
    door: ' 1234 ',
    lockbox: '',
    gate: 'G9',
    alarm: '  ',
    keyLocation: 'porch',
    notes: '',
  });
  expect(mockRpc).toHaveBeenCalledWith('set_client_access_self', {
    p_client: 'c1',
    p_door: '1234',
    p_lockbox: null,
    p_gate: 'G9',
    p_alarm: null,
    p_key_location: 'porch',
    p_notes: null,
  });
});

test('revealClientAccessSelf: first row or null, never cached here', async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ door_code: '1234' }], error: null });
  expect(await revealClientAccessSelf('c1')).toEqual({ door_code: '1234' });
  expect(mockRpc).toHaveBeenCalledWith('reveal_client_access_self', { p_client: 'c1' });
  mockRpc.mockResolvedValueOnce({ data: [], error: null });
  expect(await revealClientAccessSelf('c1')).toBeNull();
});

test('hasClientAccessSelf: strict boolean', async () => {
  mockRpc.mockResolvedValueOnce({ data: true, error: null });
  expect(await hasClientAccessSelf('c1')).toBe(true);
  mockRpc.mockResolvedValueOnce({ data: null, error: null });
  expect(await hasClientAccessSelf('c1')).toBe(false);
});

test('access wrappers surface rpc errors', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: new Error('denied') });
  await expect(revealClientAccessSelf('c1')).rejects.toThrow('denied');
});
