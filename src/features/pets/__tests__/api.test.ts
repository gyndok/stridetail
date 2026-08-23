import { createPet, getPet, listPets, petPhotoUrl, updatePet, uploadPetPhoto } from '../api';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };

const storageLog: { bucket: string; calls: Step[] }[] = [];
let mockUploadResult: { data: unknown; error: unknown } = { data: { path: 'p' }, error: null };
let mockSignedUrlResult: { data: unknown; error: unknown } = {
  data: { signedUrl: 'https://signed.example/photo.jpg' },
  error: null,
};

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
    storage: {
      from: (bucket: string) => {
        const entry = { bucket, calls: [] as Step[] };
        storageLog.push(entry);
        return {
          upload: async (...args: unknown[]) => {
            entry.calls.push(['upload', args]);
            return mockUploadResult;
          },
          createSignedUrl: async (...args: unknown[]) => {
            entry.calls.push(['createSignedUrl', args]);
            return mockSignedUrlResult;
          },
        };
      },
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  storageLog.length = 0;
  mockResult = { data: [], error: null };
  mockUploadResult = { data: { path: 'p' }, error: null };
  mockSignedUrlResult = { data: { signedUrl: 'https://signed.example/photo.jpg' }, error: null };
});

function steps(i = 0) {
  return mockLog[i]!.steps;
}
function argsOf(name: string, i = 0) {
  return steps(i)
    .filter(([n]) => n === name)
    .map(([, a]) => a);
}

const biz = '11111111-1111-1111-1111-111111111111';

test('listPets scopes by business and client, ordered by name', async () => {
  await listPets(biz, 'client-1');
  expect(mockLog[0]!.table).toBe('pets');
  expect(argsOf('eq')).toEqual([
    ['business_id', biz],
    ['client_id', 'client-1'],
  ]);
  expect(argsOf('order')).toEqual([['name']]);
});

test('getPet scopes by business and id and returns a single row', async () => {
  mockResult = { data: { id: 'pet-1' }, error: null };
  const pet = await getPet(biz, 'pet-1');
  expect(pet).toEqual({ id: 'pet-1' });
  expect(argsOf('eq')).toEqual([
    ['business_id', biz],
    ['id', 'pet-1'],
  ]);
  expect(argsOf('single')).toHaveLength(1);
});

test('createPet inserts with business and client ids attached', async () => {
  mockResult = { data: { id: 'pet-1' }, error: null };
  await createPet(biz, 'client-1', { name: 'Rex', species: 'Dog' });
  expect(argsOf('insert')).toEqual([
    [{ name: 'Rex', species: 'Dog', business_id: biz, client_id: 'client-1' }],
  ]);
});

test('updatePet patches scoped by business and id', async () => {
  mockResult = { data: { id: 'pet-1' }, error: null };
  await updatePet(biz, 'pet-1', { name: 'Rexy' });
  expect(argsOf('update')).toEqual([[{ name: 'Rexy' }]]);
  expect(argsOf('eq')).toEqual([
    ['business_id', biz],
    ['id', 'pet-1'],
  ]);
});

test('api errors are thrown', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listPets(biz, 'client-1')).rejects.toThrow('boom');
});

test('uploadPetPhoto uploads bytes to the tenant path and stores photo_path', async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ arrayBuffer: async () => bytes } as unknown as Response);
  mockResult = { data: { id: 'pet-1' }, error: null };
  try {
    await uploadPetPhoto(biz, 'pet-1', 'file:///tmp/photo.jpg');
  } finally {
    fetchSpy.mockRestore();
  }
  expect(storageLog[0]!.bucket).toBe('media');
  expect(storageLog[0]!.calls).toEqual([
    ['upload', [`${biz}/pets/pet-1/photo.jpg`, bytes, { contentType: 'image/jpeg', upsert: true }]],
  ]);
  // photo_path persisted on the pet row afterwards
  expect(mockLog[0]!.table).toBe('pets');
  expect(argsOf('update')).toEqual([[{ photo_path: `${biz}/pets/pet-1/photo.jpg` }]]);
});

test('uploadPetPhoto throws on storage error and does not touch the row', async () => {
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response);
  mockUploadResult = { data: null, error: new Error('denied') };
  try {
    await expect(uploadPetPhoto(biz, 'pet-1', 'file:///x.jpg')).rejects.toThrow('denied');
  } finally {
    fetchSpy.mockRestore();
  }
  expect(mockLog).toHaveLength(0);
});

test('petPhotoUrl signs the stored path for one hour', async () => {
  const url = await petPhotoUrl(`${biz}/pets/pet-1/photo.jpg`);
  expect(url).toBe('https://signed.example/photo.jpg');
  expect(storageLog[0]!.bucket).toBe('media');
  expect(storageLog[0]!.calls).toEqual([
    ['createSignedUrl', [`${biz}/pets/pet-1/photo.jpg`, 3600]],
  ]);
});

test('petPhotoUrl throws on error', async () => {
  mockSignedUrlResult = { data: null, error: new Error('nope') };
  await expect(petPhotoUrl('bad/path')).rejects.toThrow('nope');
});
