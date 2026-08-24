import { MemoryOutbox } from '../outbox';
import {
  backoffMs,
  classifySyncError,
  createKicker,
  drainOutbox,
  SyncError,
  toSyncError,
  type SyncApi,
  type VisitEventPayload,
} from '../sync';

jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));

type Call = { op: string; args: unknown[] };

/** Scripted fake server: records every call; throws queued failures per op. */
function fakeApi() {
  const calls: Call[] = [];
  const failures = new Map<string, unknown[]>();
  const failNext = (op: string, err: unknown) => {
    failures.set(op, [...(failures.get(op) ?? []), err]);
  };
  const record = (op: string, args: unknown[]) => {
    calls.push({ op, args });
    const q = failures.get(op);
    if (q?.length) throw q.shift();
  };
  const api: SyncApi = {
    async startVisit(v) {
      record('startVisit', [v]);
    },
    async finishVisit(v, n) {
      record('finishVisit', [v, n]);
    },
    async insertEvent(r) {
      record('insertEvent', [r]);
    },
    async pushTrack(v, s) {
      record('pushTrack', [v, s]);
    },
    async uploadPhoto(b, v, c, u) {
      record('uploadPhoto', [b, v, c, u]);
      return `${b}/${v}/${c}.jpg`;
    },
  };
  return { api, calls, failNext };
}

const eventPayload = (over: Partial<VisitEventPayload> = {}): VisitEventPayload => ({
  visitId: 'v1',
  businessId: 'b1',
  clientUuid: 'cu-1',
  type: 'pee',
  occurredAt: '2026-08-24T10:00:00.000Z',
  ...over,
});

function setup() {
  let t = 1000;
  const box = new MemoryOutbox(() => t);
  const tick = (ms = 1) => {
    t += ms;
  };
  const { api, calls, failNext } = fakeApi();
  const schedule = new Map<string, number>();
  const drain = (nowMs?: number) =>
    drainOutbox({ outbox: box, api, now: () => nowMs ?? t, retrySchedule: schedule });
  return { box, tick, api, calls, failNext, schedule, drain };
}

test('drains every kind in strict insertion order with the mapped server calls', async () => {
  const { box, tick, calls, drain } = setup();
  await box.enqueue('visit.start', { visitId: 'v1' });
  tick();
  await box.enqueue('visit.event', eventPayload({ petId: 'p1', text: 'good boy' }));
  tick();
  const track = await box.enqueue('visit.track', {
    visitId: 'v1',
    segmentNo: 1,
    points: [{ t: 1, lat: 0, lng: 0, acc: 5 }],
  });
  tick();
  await box.enqueue('visit.finish', { visitId: 'v1', privateNotes: 'gate latch loose' });

  const result = await drain();
  expect(result).toEqual({ sent: 4, errored: 0, stopped: 'empty' });
  expect(await box.countPending()).toBe(0);
  expect(calls.map((c) => c.op)).toEqual(['startVisit', 'insertEvent', 'pushTrack', 'finishVisit']);
  expect(calls[0]!.args).toEqual(['v1']);
  expect(calls[1]!.args).toEqual([
    {
      business_id: 'b1',
      visit_id: 'v1',
      pet_id: 'p1',
      type: 'pee',
      occurred_at: '2026-08-24T10:00:00.000Z',
      text: 'good boy',
      photo_path: null,
      client_uuid: 'cu-1',
    },
  ]);
  // Plan-1 track payload has no clientUuid: the outbox item id stands in (stable across re-drains).
  expect(calls[2]!.args).toEqual([
    'v1',
    [{ segmentNo: 1, points: [{ t: 1, lat: 0, lng: 0, acc: 5 }], clientUuid: track.id }],
  ]);
  expect(calls[3]!.args).toEqual(['v1', 'gate latch loose']);
});

test('a track payload that carries its own clientUuid keeps it', async () => {
  const { box, calls, drain } = setup();
  await box.enqueue('visit.track', { visitId: 'v1', segmentNo: 2, points: [], clientUuid: 'cu-t' });
  await drain();
  expect(calls[0]!.args[1]).toEqual([{ segmentNo: 2, points: [], clientUuid: 'cu-t' }]);
});

test('photo events upload the photo first, then insert the row with the returned path', async () => {
  const { box, calls, drain } = setup();
  await box.enqueue(
    'visit.event',
    eventPayload({ type: 'photo', photoLocalUri: 'file:///tmp/p.jpg' }),
  );
  await drain();
  expect(calls.map((c) => c.op)).toEqual(['uploadPhoto', 'insertEvent']);
  expect(calls[0]!.args).toEqual(['b1', 'v1', 'cu-1', 'file:///tmp/p.jpg']);
  expect((calls[1]!.args[0] as { photo_path: string }).photo_path).toBe('b1/v1/cu-1.jpg');
});

test('a retryable failure stops the drain, bumps attempts, and leaves later items untouched', async () => {
  const { box, tick, calls, failNext, drain } = setup();
  await box.enqueue('visit.start', { visitId: 'v1' });
  tick();
  const ev = await box.enqueue('visit.event', eventPayload());
  tick();
  await box.enqueue('visit.finish', { visitId: 'v1' });
  failNext('insertEvent', new SyncError('server exploded', 500));

  const result = await drain();
  expect(result).toEqual({ sent: 1, errored: 0, stopped: 'retryable' });
  expect(calls.map((c) => c.op)).toEqual(['startVisit', 'insertEvent']); // finish never attempted
  const pending = await box.nextPending();
  expect(pending.map((i) => i.id)[0]).toBe(ev.id);
  expect(pending[0]!.attempts).toBe(1);
  expect(await box.countPending()).toBe(2);
});

test('after a retryable failure the item backs off, then a later drain finishes idempotently', async () => {
  const { box, tick, calls, failNext, drain } = setup();
  await box.enqueue('visit.start', { visitId: 'v1' });
  tick();
  await box.enqueue('visit.event', eventPayload());
  tick();
  await box.enqueue('visit.finish', { visitId: 'v1' });
  failNext('insertEvent', new SyncError('flaky', 503));
  await drain();
  calls.length = 0;

  // Immediately re-kicked: the head item is inside its backoff window — nothing runs.
  expect(await drain()).toEqual({ sent: 0, errored: 0, stopped: 'backoff' });
  expect(calls).toEqual([]);

  // Past the backoff window: only the unsent items run (start is never re-sent).
  expect(await drain(1003 + backoffMs(1))).toEqual({ sent: 2, errored: 0, stopped: 'empty' });
  expect(calls.map((c) => c.op)).toEqual(['insertEvent', 'finishVisit']);
  expect(await box.countPending()).toBe(0);
});

test('a plain network error (no status) is retryable', async () => {
  const { box, failNext, drain } = setup();
  await box.enqueue('visit.start', { visitId: 'v1' });
  failNext('startVisit', new TypeError('Network request failed'));
  expect((await drain()).stopped).toBe('retryable');
  expect((await box.nextPending())[0]!.attempts).toBe(1);
});

test('a permanent 4xx parks the item as error and the drain continues', async () => {
  const { box, tick, calls, failNext, drain } = setup();
  const bad = await box.enqueue('visit.event', eventPayload());
  tick();
  await box.enqueue('visit.finish', { visitId: 'v1' });
  failNext('insertEvent', new SyncError('violates row-level security', 403));

  const result = await drain();
  expect(result).toEqual({ sent: 1, errored: 1, stopped: 'empty' });
  expect(calls.map((c) => c.op)).toEqual(['insertEvent', 'finishVisit']);
  expect(await box.countPending()).toBe(0);
  expect(await box.countErrors()).toBe(1);
  expect((await box.nextPending()).find((i) => i.id === bad.id)).toBeUndefined();
});

test.each([401, 408, 429])('status %i is retryable, not permanent', async (status) => {
  const { box, failNext, drain } = setup();
  await box.enqueue('visit.start', { visitId: 'v1' });
  failNext('startVisit', new SyncError('try again', status));
  expect((await drain()).stopped).toBe('retryable');
  expect(await box.countErrors()).toBe(0);
});

test('start_visit "already in progress/completed" conflicts count as success', async () => {
  const { box, tick, failNext, drain } = setup();
  await box.enqueue('visit.start', { visitId: 'v1' });
  tick();
  await box.enqueue('visit.start', { visitId: 'v2' });
  failNext('startVisit', new SyncError('visit is not accepted (status: in_progress)', 400));
  failNext('startVisit', new SyncError('visit is not accepted (status: completed)', 400));
  expect(await drain()).toEqual({ sent: 2, errored: 0, stopped: 'empty' });
  expect(await box.countErrors()).toBe(0);
});

test('finish_visit "already completed" counts as success', async () => {
  const { box, failNext, drain } = setup();
  await box.enqueue('visit.finish', { visitId: 'v1' });
  failNext('finishVisit', new SyncError('visit is not in progress (status: completed)', 400));
  expect(await drain()).toEqual({ sent: 1, errored: 0, stopped: 'empty' });
});

test('a start conflict where the visit never started stays a permanent error', async () => {
  const { box, failNext, drain } = setup();
  await box.enqueue('visit.start', { visitId: 'v1' });
  failNext('startVisit', new SyncError('visit is not accepted (status: offered)', 400));
  expect(await drain()).toEqual({ sent: 0, errored: 1, stopped: 'empty' });
  expect(await box.countErrors()).toBe(1);
});

test('re-draining after everything sent calls the server zero times', async () => {
  const { box, calls, drain } = setup();
  await box.enqueue('visit.start', { visitId: 'v1' });
  await drain();
  calls.length = 0;
  expect(await drain()).toEqual({ sent: 0, errored: 0, stopped: 'empty' });
  expect(calls).toEqual([]);
});

test('isOnline false short-circuits the drain', async () => {
  const { box, api, calls, schedule } = setup();
  await box.enqueue('visit.start', { visitId: 'v1' });
  const result = await drainOutbox({
    outbox: box,
    api,
    isOnline: () => false,
    retrySchedule: schedule,
  });
  expect(result).toEqual({ sent: 0, errored: 0, stopped: 'offline' });
  expect(calls).toEqual([]);
});

test('an item that always fails retryably gives up after MAX_ATTEMPTS', async () => {
  const { box, failNext, drain } = setup();
  await box.enqueue('visit.start', { visitId: 'v1' });
  let now = 10_000;
  for (let i = 0; i < 10; i++) {
    failNext('startVisit', new SyncError('down', 500));
    expect((await drain(now)).stopped).toBe('retryable');
    now += backoffMs(i + 1) + 1;
  }
  expect(await box.countPending()).toBe(0); // state 'failed', no longer drained
  expect(await drain(now)).toEqual({ sent: 0, errored: 0, stopped: 'empty' });
});

describe('classifySyncError / toSyncError / backoffMs', () => {
  test('extracts status from FunctionsHttpError-style context', () => {
    const e = { message: 'not ok', context: { status: 409 } };
    expect(toSyncError(e).status).toBe(409);
    expect(classifySyncError(e, 'visit.track')).toBe('permanent');
  });
  test('status 0 (postgrest network failure) means retryable', () => {
    expect(toSyncError({ message: 'fetch failed', status: 0 }).status).toBeUndefined();
    expect(classifySyncError({ message: 'fetch failed', status: 0 }, 'visit.event')).toBe(
      'retryable',
    );
  });
  test('5xx retryable, other 4xx permanent', () => {
    expect(classifySyncError(new SyncError('x', 502), 'visit.event')).toBe('retryable');
    expect(classifySyncError(new SyncError('x', 404), 'visit.event')).toBe('permanent');
    expect(classifySyncError(new SyncError('x', 409), 'visit.finish')).toBe('permanent');
  });
  test('already-done regexes only match their own kind', () => {
    const started = new SyncError('visit is not accepted (status: in_progress)', 400);
    expect(classifySyncError(started, 'visit.finish')).toBe('permanent');
  });
  test('backoff grows and caps at five minutes', () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(100)).toBe(5 * 60_000);
  });
});

describe('createKicker', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('coalesces a burst of kicks into one drain', async () => {
    const drain = jest.fn(async () => {});
    const kick = createKicker(drain, 300);
    kick();
    kick();
    kick();
    await jest.advanceTimersByTimeAsync(299);
    expect(drain).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(drain).toHaveBeenCalledTimes(1);
  });

  test('a kick during a running drain schedules exactly one follow-up', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const drain = jest.fn(() => gate);
    const kick = createKicker(drain, 100);
    kick();
    await jest.advanceTimersByTimeAsync(100);
    expect(drain).toHaveBeenCalledTimes(1);
    kick(); // while running
    kick();
    await jest.advanceTimersByTimeAsync(500);
    expect(drain).toHaveBeenCalledTimes(1); // still blocked
    release();
    await jest.advanceTimersByTimeAsync(100);
    expect(drain).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1000);
    expect(drain).toHaveBeenCalledTimes(2); // no runaway loop
  });
});
