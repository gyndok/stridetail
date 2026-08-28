import {
  approveBookingRequest,
  approveStartUtc,
  BOOKING_REQUEST_COLUMNS,
  createBookingRequest,
  declineBookingRequest,
  listMyBookingRequests,
  listPendingBookingRequests,
  listPortalServices,
  OWNER_REQUEST_COLUMNS,
  PORTAL_SERVICE_COLUMNS,
  requestStatusChip,
  requestWindow,
  requestWindowLabel,
  windowStartHhmm,
  windowTimeRangeLabel,
} from '../requestsApi';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
const mockRpcLog: { fn: string; args: unknown }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };
let mockSession: { user: { id: string } } | null = { user: { id: 'u1' } };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit', 'insert', 'single']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(mockResult));
      return builder;
    },
    rpc: (fn: string, args: unknown) => {
      mockRpcLog.push({ fn, args });
      return Promise.resolve(mockResult);
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockSession } }),
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockRpcLog.length = 0;
  mockResult = { data: [], error: null };
  mockSession = { user: { id: 'u1' } };
});

/**
 * FORBIDDEN-column contract, extended to the Task 7 selects (portalQueries
 * pattern). booking_requests.decline_reason is THE deliberate exception:
 * unlike visits.decline_reason (a walker-internal note), the request's
 * decline reason is written BY the owner FOR the client (the decline email
 * carries it too), and the Task-1 client SELECT policy exposes the row.
 */
const FORBIDDEN = /price_cents_snapshot|owner_notes_md|private_notes_md/;

test('request column constants exclude the forbidden columns', () => {
  expect(BOOKING_REQUEST_COLUMNS).not.toMatch(FORBIDDEN);
  expect(OWNER_REQUEST_COLUMNS).not.toMatch(FORBIDDEN);
  expect(PORTAL_SERVICE_COLUMNS).not.toMatch(FORBIDDEN);
  // The one intentionally client-readable field (see docblock above).
  expect(BOOKING_REQUEST_COLUMNS).toContain('decline_reason');
});

test('listMyBookingRequests: named columns, client scope, newest first', async () => {
  await listMyBookingRequests('c1');
  expect(mockLog[0]?.table).toBe('booking_requests');
  expect(mockLog[0]?.steps).toEqual([
    ['select', [BOOKING_REQUEST_COLUMNS]],
    ['eq', ['client_id', 'c1']],
    ['order', ['created_at', { ascending: false }]],
  ]);
  const select = String(mockLog[0]?.steps[0]?.[1]?.[0]);
  expect(select).toContain('service:services(name)');
  expect(select).toContain('visit:visits(scheduled_start, business_tz)');
});

test('listPortalServices: active services of the scoped business, prices included', async () => {
  await listPortalServices('b1');
  expect(mockLog[0]?.table).toBe('services');
  expect(mockLog[0]?.steps).toEqual([
    ['select', [PORTAL_SERVICE_COLUMNS]],
    ['eq', ['business_id', 'b1']],
    ['eq', ['active', true]],
    ['order', ['name', { ascending: true }]],
  ]);
  // Clients are the payer: prices are deliberately readable (Task-1 decision).
  expect(PORTAL_SERVICE_COLUMNS).toContain('base_price_cents');
  expect(PORTAL_SERVICE_COLUMNS).toContain('extra_pet_price_cents');
});

test('createBookingRequest: pending row, scoped ids, self-authored', async () => {
  mockResult = { data: { id: 'r1' }, error: null };
  const start = new Date('2026-08-27T19:00:00Z');
  const end = new Date('2026-08-27T21:00:00Z');
  const res = await createBookingRequest({
    businessId: 'b1',
    clientId: 'c1',
    serviceId: 's1',
    petIds: ['p1', 'p2'],
    startUtc: start,
    endUtc: end,
    note: '  Please use the side gate  ',
  });
  expect(res).toEqual({ id: 'r1' });
  expect(mockLog[0]?.table).toBe('booking_requests');
  expect(mockLog[0]?.steps).toEqual([
    [
      'insert',
      [
        {
          business_id: 'b1',
          client_id: 'c1',
          service_id: 's1',
          pet_ids: ['p1', 'p2'],
          window_start: '2026-08-27T19:00:00.000Z',
          window_end: '2026-08-27T21:00:00.000Z',
          note_md: 'Please use the side gate',
          status: 'pending',
          created_by: 'u1',
        },
      ],
    ],
    ['select', ['id']],
    ['single', []],
  ]);
});

test('createBookingRequest: empty note becomes null, no session throws', async () => {
  mockResult = { data: { id: 'r1' }, error: null };
  await createBookingRequest({
    businessId: 'b1',
    clientId: 'c1',
    serviceId: 's1',
    petIds: ['p1'],
    startUtc: new Date('2026-08-27T19:00:00Z'),
    endUtc: new Date('2026-08-27T21:00:00Z'),
    note: '   ',
  });
  const row = mockLog[0]?.steps[0]?.[1]?.[0] as { note_md: unknown };
  expect(row.note_md).toBeNull();

  mockSession = null;
  await expect(
    createBookingRequest({
      businessId: 'b1',
      clientId: 'c1',
      serviceId: 's1',
      petIds: ['p1'],
      startUtc: new Date('2026-08-27T19:00:00Z'),
      endUtc: new Date('2026-08-27T21:00:00Z'),
      note: '',
    }),
  ).rejects.toThrow('signed in');
});

test('listPendingBookingRequests: business scope, pending only, oldest first', async () => {
  await listPendingBookingRequests('b1');
  expect(mockLog[0]?.table).toBe('booking_requests');
  expect(mockLog[0]?.steps).toEqual([
    ['select', [OWNER_REQUEST_COLUMNS]],
    ['eq', ['business_id', 'b1']],
    ['eq', ['status', 'pending']],
    ['order', ['created_at', { ascending: true }]],
  ]);
  expect(OWNER_REQUEST_COLUMNS).toContain('client:clients(name)');
  // duration_min rides on the service embed so the approve card can compute
  // the slot end for the walker-chip availability hints.
  expect(OWNER_REQUEST_COLUMNS).toContain('service:services(name, duration_min)');
});

test('approveBookingRequest: RPC shape with and without a walker and start', async () => {
  mockResult = { data: 'v1', error: null };
  await approveBookingRequest('r1');
  expect(mockRpcLog[0]).toEqual({
    fn: 'approve_booking_request',
    args: { p_request: 'r1', p_walker: null, p_start: null },
  });
  await approveBookingRequest('r1', 'w1');
  expect(mockRpcLog[1]).toEqual({
    fn: 'approve_booking_request',
    args: { p_request: 'r1', p_walker: 'w1', p_start: null },
  });
  await approveBookingRequest('r1', 'w1', new Date('2026-08-27T19:30:00Z'));
  expect(mockRpcLog[2]).toEqual({
    fn: 'approve_booking_request',
    args: { p_request: 'r1', p_walker: 'w1', p_start: '2026-08-27T19:30:00.000Z' },
  });
});

test('windowStartHhmm: the window start as business-tz wall clock', () => {
  // 19:00 UTC on 2026-08-27 is 2:00 PM CDT.
  expect(windowStartHhmm('2026-08-27T19:00:00Z', 'America/Chicago')).toBe('14:00');
  expect(windowStartHhmm('2026-08-27T19:00:00Z', 'America/New_York')).toBe('15:00');
});

test('windowTimeRangeLabel renders the allowed range in the business zone', () => {
  expect(
    windowTimeRangeLabel('2026-08-27T19:00:00Z', '2026-08-27T21:00:00Z', 'America/Chicago'),
  ).toBe('2:00 PM – 4:00 PM');
});

test('approveStartUtc: converts inside the window; outside or malformed is null', () => {
  const ws = '2026-08-27T19:00:00Z'; // 2:00 PM CDT
  const we = '2026-08-27T21:00:00Z'; // 4:00 PM CDT
  const tz = 'America/Chicago';
  // The window start itself is the default and valid.
  expect(approveStartUtc(ws, we, '14:00', tz)?.toISOString()).toBe('2026-08-27T19:00:00.000Z');
  expect(approveStartUtc(ws, we, '15:30', tz)?.toISOString()).toBe('2026-08-27T20:30:00.000Z');
  // Bounds mirror the RPC: [window_start, window_end).
  expect(approveStartUtc(ws, we, '13:59', tz)).toBeNull();
  expect(approveStartUtc(ws, we, '16:00', tz)).toBeNull();
  expect(approveStartUtc(ws, we, '17:00', tz)).toBeNull();
  expect(approveStartUtc(ws, we, 'nope', tz)).toBeNull();
});

test('declineBookingRequest: RPC shape carries the trimmed reason', async () => {
  mockResult = { data: null, error: null };
  await declineBookingRequest('r1', '  Fully booked that day  ');
  expect(mockRpcLog[0]).toEqual({
    fn: 'decline_booking_request',
    args: { p_request: 'r1', p_reason: 'Fully booked that day' },
  });
});

test('requestWindow: business-tz instants; end must be after start', () => {
  // 2026-08-27 is CDT (UTC-5).
  const w = requestWindow('2026-08-27', '14:00', '16:00', 'America/Chicago');
  expect(w?.startUtc.toISOString()).toBe('2026-08-27T19:00:00.000Z');
  expect(w?.endUtc.toISOString()).toBe('2026-08-27T21:00:00.000Z');
  // end == start and end < start are both invalid — client-side mirror of the
  // schema's `check (window_end > window_start)`.
  expect(requestWindow('2026-08-27', '14:00', '14:00', 'America/Chicago')).toBeNull();
  expect(requestWindow('2026-08-27', '14:00', '13:00', 'America/Chicago')).toBeNull();
  expect(requestWindow('not-a-date', '14:00', '16:00', 'America/Chicago')).toBeNull();
});

test('requestStatusChip: one chip per status', () => {
  expect(requestStatusChip('pending')).toEqual({ label: 'Pending', tone: 'warning' });
  expect(requestStatusChip('approved')).toEqual({ label: 'Approved', tone: 'green' });
  expect(requestStatusChip('declined')).toEqual({ label: 'Declined', tone: 'muted' });
});

test('requestWindowLabel renders the window in the business zone', () => {
  expect(
    requestWindowLabel('2026-08-27T19:00:00Z', '2026-08-27T21:00:00Z', 'America/Chicago'),
  ).toBe('Thu, Aug 27 · 2:00 PM – 4:00 PM');
});

test('queries surface supabase errors', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listMyBookingRequests('c1')).rejects.toThrow('boom');
  await expect(approveBookingRequest('r1')).rejects.toThrow('boom');
});
