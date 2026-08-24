import { pushTrackSegments, storageVisitPhotoPath, uploadVisitPhoto } from '../upload';

type Step = [string, unknown[]];

const invokeLog: { name: string; options: unknown }[] = [];
let mockInvokeResult: { data: unknown; error: unknown } = {
  data: { distanceM: 0, inserted: 0 },
  error: null,
};

const storageLog: { bucket: string; calls: Step[] }[] = [];
let mockUploadResult: { data: unknown; error: unknown } = { data: { path: 'p' }, error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: async (name: string, options: unknown) => {
        invokeLog.push({ name, options });
        return mockInvokeResult;
      },
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
        };
      },
    },
  },
}));

beforeEach(() => {
  invokeLog.length = 0;
  storageLog.length = 0;
  mockInvokeResult = { data: { distanceM: 0, inserted: 0 }, error: null };
  mockUploadResult = { data: { path: 'p' }, error: null };
});

const biz = '11111111-1111-1111-1111-111111111111';
const visit = '22222222-2222-2222-2222-222222222222';
const cu = '33333333-3333-3333-3333-333333333333';

test('pushTrackSegments invokes ingest-track with the exact payload shape', async () => {
  const segments = [
    { segmentNo: 0, points: [{ t: 1, lat: 0, lng: 0, acc: 5 }], clientUuid: cu },
    { segmentNo: 1, points: [{ t: 2, lat: 0.001, lng: 0 }], clientUuid: `${cu}4` },
  ];
  mockInvokeResult = { data: { distanceM: 111.19, inserted: 2 }, error: null };
  const result = await pushTrackSegments(visit, segments);
  expect(result).toEqual({ distanceM: 111.19, inserted: 2 });
  expect(invokeLog).toEqual([
    { name: 'ingest-track', options: { body: { visitId: visit, segments } } },
  ]);
});

test('pushTrackSegments throws on function error', async () => {
  mockInvokeResult = { data: null, error: new Error('forbidden') };
  await expect(pushTrackSegments(visit, [])).rejects.toThrow('forbidden');
});

test('storageVisitPhotoPath builds business/visit/clientUuid.jpg', () => {
  expect(storageVisitPhotoPath(biz, visit, cu)).toBe(`${biz}/${visit}/${cu}.jpg`);
});

test('uploadVisitPhoto uploads bytes to the visit path as jpeg and returns the path', async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ arrayBuffer: async () => bytes } as unknown as Response);
  let path: string;
  try {
    path = await uploadVisitPhoto(biz, visit, cu, 'file:///tmp/photo.jpg');
  } finally {
    fetchSpy.mockRestore();
  }
  expect(path).toBe(`${biz}/${visit}/${cu}.jpg`);
  expect(storageLog[0]!.bucket).toBe('media');
  expect(storageLog[0]!.calls).toEqual([
    [
      'upload',
      [`${biz}/${visit}/${cu}.jpg`, bytes, { contentType: 'image/jpeg', upsert: true }],
    ],
  ]);
});

test('uploadVisitPhoto throws on storage error', async () => {
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response);
  mockUploadResult = { data: null, error: new Error('denied') };
  try {
    await expect(uploadVisitPhoto(biz, visit, cu, 'file:///x.jpg')).rejects.toThrow('denied');
  } finally {
    fetchSpy.mockRestore();
  }
});
