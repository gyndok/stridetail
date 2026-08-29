import {
  addDocument,
  deleteDocument,
  docTypeLabel,
  DOC_TYPES,
  expiryState,
  listDocuments,
  signedDocumentUrl,
  storagePetDocPath,
} from '../documents';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };

const storageLog: { bucket: string; calls: Step[] }[] = [];
let mockUploadResult: { data: unknown; error: unknown } = { data: { path: 'p' }, error: null };
let mockRemoveResult: { data: unknown; error: unknown } = { data: [], error: null };
let mockSignedUrlResult: { data: unknown; error: unknown } = {
  data: { signedUrl: 'https://signed.example/doc.pdf' },
  error: null,
};

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'single']) {
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
          remove: async (...args: unknown[]) => {
            entry.calls.push(['remove', args]);
            return mockRemoveResult;
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
  mockRemoveResult = { data: [], error: null };
  mockSignedUrlResult = { data: { signedUrl: 'https://signed.example/doc.pdf' }, error: null };
});

function argsOf(name: string, i = 0) {
  return mockLog[i]!.steps.filter(([n]) => n === name).map(([, a]) => a);
}

const biz = '11111111-1111-1111-1111-111111111111';

// ===== expiry badge state (pure, injected now) =====
// Injected "now": 2026-08-23 local.
const now = new Date(2026, 7, 23, 14, 30);

test('expiryState is none when no expiry date is set', () => {
  expect(expiryState(null, now)).toBe('none');
  expect(expiryState(undefined, now)).toBe('none');
  expect(expiryState('', now)).toBe('none');
});

test('expiryState is none for malformed or impossible dates', () => {
  expect(expiryState('soon', now)).toBe('none');
  expect(expiryState('2026-02-30', now)).toBe('none');
  expect(expiryState('08/23/2026', now)).toBe('none');
});

test('expiryState is expired strictly before today', () => {
  expect(expiryState('2026-08-22', now)).toBe('expired');
  expect(expiryState('2020-01-01', now)).toBe('expired');
});

test('expiryState is warning from today up to 29 days out', () => {
  expect(expiryState('2026-08-23', now)).toBe('warning'); // expires today: still valid, flag it
  expect(expiryState('2026-09-21', now)).toBe('warning'); // 29 days
});

test('expiryState is ok from 30 days out', () => {
  expect(expiryState('2026-09-22', now)).toBe('ok'); // exactly 30 days
  expect(expiryState('2027-08-23', now)).toBe('ok');
});

// ===== storage path builder =====
test('storagePetDocPath is tenant-scoped with a per-doc uuid segment', () => {
  const path = storagePetDocPath(biz, 'pet-1', 'pdf');
  expect(path).toMatch(new RegExp(`^${biz}/pets/pet-1/docs/[A-Za-z0-9-]+\\.pdf$`));
});

test('storagePetDocPath generates a fresh name per call', () => {
  expect(storagePetDocPath(biz, 'pet-1', 'jpg')).not.toBe(storagePetDocPath(biz, 'pet-1', 'jpg'));
});

// ===== doc type labels =====
test('docTypeLabel covers every doc_type enum value', () => {
  expect(DOC_TYPES).toEqual(['rabies', 'dhpp', 'lepto', 'bordetella', 'fvrcp', 'other']);
  expect(docTypeLabel('rabies')).toBe('Rabies');
  expect(docTypeLabel('dhpp')).toBe('DHPP');
  expect(docTypeLabel('lepto')).toBe('Leptospirosis');
  expect(docTypeLabel('bordetella')).toBe('Bordetella');
  expect(docTypeLabel('fvrcp')).toBe('FVRCP (feline)');
  expect(docTypeLabel('other')).toBe('Other');
});

// ===== query shape =====
test('listDocuments scopes by business and pet, newest first', async () => {
  await listDocuments(biz, 'pet-1');
  expect(mockLog[0]!.table).toBe('pet_documents');
  expect(argsOf('eq')).toEqual([
    ['business_id', biz],
    ['pet_id', 'pet-1'],
  ]);
  expect(argsOf('order')).toEqual([['created_at', { ascending: false }]]);
});

test('addDocument uploads the file then inserts a scoped row', async () => {
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(4) } as unknown as Response);
  mockResult = { data: { id: 'doc-1' }, error: null };
  try {
    const doc = await addDocument({
      businessId: biz,
      petId: 'pet-1',
      type: 'rabies',
      expiresOn: '2027-01-01',
      source: { uri: 'file:///picked.pdf', kind: 'pdf' },
    });
    expect(doc).toEqual({ id: 'doc-1' });
    expect(fetchSpy).toHaveBeenCalledWith('file:///picked.pdf');

    expect(storageLog[0]!.bucket).toBe('media');
    const [path, , options] = storageLog[0]!.calls[0]![1] as [string, unknown, { contentType: string }];
    expect(path).toMatch(new RegExp(`^${biz}/pets/pet-1/docs/[A-Za-z0-9-]+\\.pdf$`));
    expect(options.contentType).toBe('application/pdf');

    expect(mockLog[0]!.table).toBe('pet_documents');
    const [inserted] = argsOf('insert')[0] as [Record<string, unknown>];
    expect(inserted.business_id).toBe(biz);
    expect(inserted.pet_id).toBe('pet-1');
    expect(inserted.type).toBe('rabies');
    expect(inserted.expires_on).toBe('2027-01-01');
    expect(inserted.storage_path).toBe(path);
  } finally {
    fetchSpy.mockRestore();
  }
});

test('addDocument uploads images as jpg', async () => {
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(4) } as unknown as Response);
  mockResult = { data: { id: 'doc-2' }, error: null };
  try {
    await addDocument({
      businessId: biz,
      petId: 'pet-1',
      type: 'other',
      expiresOn: null,
      source: { uri: 'file:///photo.jpg', kind: 'image' },
    });
    const [path, , options] = storageLog[0]!.calls[0]![1] as [string, unknown, { contentType: string }];
    expect(path).toMatch(/\.jpg$/);
    expect(options.contentType).toBe('image/jpeg');
    const [inserted] = argsOf('insert')[0] as [Record<string, unknown>];
    expect(inserted.expires_on).toBeNull();
  } finally {
    fetchSpy.mockRestore();
  }
});

test('deleteDocument removes the scoped row then the stored object', async () => {
  mockResult = { data: null, error: null };
  await deleteDocument(biz, { id: 'doc-1', storage_path: `${biz}/pets/pet-1/docs/a.pdf` });
  expect(mockLog[0]!.table).toBe('pet_documents');
  expect(argsOf('delete')).toHaveLength(1);
  expect(argsOf('eq')).toEqual([
    ['business_id', biz],
    ['id', 'doc-1'],
  ]);
  expect(storageLog[0]!.bucket).toBe('media');
  expect(storageLog[0]!.calls).toEqual([['remove', [[`${biz}/pets/pet-1/docs/a.pdf`]]]]);
});

test('signedDocumentUrl signs for one hour', async () => {
  const url = await signedDocumentUrl(`${biz}/pets/pet-1/docs/a.pdf`);
  expect(url).toBe('https://signed.example/doc.pdf');
  expect(storageLog[0]!.calls).toEqual([
    ['createSignedUrl', [`${biz}/pets/pet-1/docs/a.pdf`, 3600]],
  ]);
});
