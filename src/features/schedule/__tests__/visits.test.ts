import {
  VISIT_COLUMNS,
  cancelVisit,
  createVisit,
  groupVisitsByLocalDay,
  listVisits,
  needsAttention,
  memberName,
  offerVisit,
  pickerContext,
  isEditableStatus,
  priceSnapshotCents,
  updateVisitDetails,
  visitInstants,
  walkerFlags,
  type PickerContext,
} from '../api';
import { flagLabel } from '../WalkerPicker';

// ---- supabase mock (queries + rpc + auth) ----

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
// One result per awaited query, consumed in order (pickerContext runs three).
const mockResults: { data: unknown; error: unknown }[] = [];
const mockRpc = jest.fn(async () => ({ data: null, error: null }));
let mockUserId: string | null = 'me';

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'not', 'gte', 'lt', 'gt', 'order', 'insert', 'update', 'single']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve(mockResults.shift() ?? { data: null, error: null }));
      return builder;
    },
    rpc: (...args: unknown[]) => mockRpc(...(args as [])),
    auth: {
      getSession: async () => ({
        data: { session: mockUserId ? { user: { id: mockUserId } } : null },
      }),
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResults.length = 0;
  mockRpc.mockClear();
  mockUserId = 'me';
});

const CHI = 'America/Chicago';

// ---- priceSnapshotCents ----

const svc = { base_price_cents: 2500, extra_pet_price_cents: 500 };

test('priceSnapshotCents is base + extra per pet beyond the first', () => {
  expect(priceSnapshotCents(svc, 1)).toBe(2500);
  expect(priceSnapshotCents(svc, 2)).toBe(3000);
  expect(priceSnapshotCents(svc, 3)).toBe(3500);
});

test('priceSnapshotCents never goes below base for degenerate pet counts', () => {
  expect(priceSnapshotCents(svc, 0)).toBe(2500);
});

// ---- visitInstants (business-tz wall time -> UTC) ----

test('visitInstants converts local date+time in the business tz to UTC instants', () => {
  // 2026-09-01 is CDT (UTC-5).
  const out = visitInstants('2026-09-01', '09:00', 30, CHI);
  expect(out).not.toBeNull();
  expect(out!.startUtc.toISOString()).toBe('2026-09-01T14:00:00.000Z');
  expect(out!.endUtc.toISOString()).toBe('2026-09-01T14:30:00.000Z');
});

test('visitInstants end is duration in absolute minutes', () => {
  const out = visitInstants('2026-01-15', '23:45', 60, CHI); // CST, UTC-6
  expect(out!.startUtc.toISOString()).toBe('2026-01-16T05:45:00.000Z');
  expect(out!.endUtc.toISOString()).toBe('2026-01-16T06:45:00.000Z');
});

test('visitInstants rejects malformed dates, impossible dates, and bad times', () => {
  expect(visitInstants('09/01/2026', '09:00', 30, CHI)).toBeNull();
  expect(visitInstants('2026-02-30', '09:00', 30, CHI)).toBeNull();
  expect(visitInstants('2026-09-01', '25:00', 30, CHI)).toBeNull();
  expect(visitInstants('2026-09-01', '9am', 30, CHI)).toBeNull();
});

// ---- groupVisitsByLocalDay ----

test('groupVisitsByLocalDay groups by the LOCAL day in each visit business_tz', () => {
  const rows = [
    // 2026-09-02T02:00Z is Sep 1, 21:00 in Chicago.
    { id: 'late', scheduled_start: '2026-09-02T02:00:00Z', business_tz: CHI },
    { id: 'morning', scheduled_start: '2026-09-02T14:00:00Z', business_tz: CHI },
    { id: 'early', scheduled_start: '2026-09-01T12:00:00Z', business_tz: CHI },
  ];
  const groups = groupVisitsByLocalDay(rows);
  expect(groups.map((g) => g.day)).toEqual(['2026-09-01', '2026-09-02']);
  expect(groups[0]!.visits.map((v) => v.id)).toEqual(['early', 'late']);
  expect(groups[1]!.visits.map((v) => v.id)).toEqual(['morning']);
});

// ---- needsAttention ----

test('needsAttention flags unassigned visits and visits carrying a decline reason', () => {
  expect(needsAttention({ status: 'unassigned', decline_reason: null })).toBe(true);
  expect(needsAttention({ status: 'unassigned', decline_reason: 'sick' })).toBe(true);
  expect(needsAttention({ status: 'accepted', decline_reason: null })).toBe(false);
  expect(needsAttention({ status: 'offered', decline_reason: null })).toBe(false);
});

// ---- walkerFlags ----

// Window: Monday 2026-08-31 10:00–10:30 Chicago = 15:00–15:30Z.
const win = { startUtc: new Date('2026-08-31T15:00:00Z'), endUtc: new Date('2026-08-31T15:30:00Z') };
const ctx: PickerContext = {
  rules: [
    { user_id: 'u1', weekday: 1, start_local: '09:00:00', end_local: '17:00:00' },
    { user_id: 'u3', weekday: 1, start_local: '09:00:00', end_local: '17:00:00' },
  ],
  timeOff: [
    { user_id: 'u2', starts_at: '2026-08-31T05:00:00Z', ends_at: '2026-09-01T05:00:00Z' },
  ],
  visits: [
    { id: 'v-existing', walker_id: 'u3', scheduled_start: '2026-08-31T15:00:00Z', scheduled_end: '2026-08-31T15:20:00Z' },
  ],
};

test('walkerFlags: inside an availability rule, no time off, no overlaps', () => {
  expect(walkerFlags('u1', ctx, win, CHI)).toEqual({
    available: true,
    onTimeOff: false,
    overlaps: 0,
    tight: null,
  });
});

test('walkerFlags: time off blocks the window; no rules means unavailable', () => {
  expect(walkerFlags('u2', ctx, win, CHI)).toEqual({
    available: false,
    onTimeOff: true,
    overlaps: 0,
    tight: null,
  });
});

test('walkerFlags: counts overlapping visits for that walker only', () => {
  expect(walkerFlags('u3', ctx, win, CHI)).toEqual({
    available: true,
    onTimeOff: false,
    overlaps: 1,
    tight: null,
  });
});

test('walkerFlags: an excluded visit id (rescheduling that visit) does not count', () => {
  expect(walkerFlags('u3', ctx, win, CHI, { excludeVisitId: 'v-existing' }).overlaps).toBe(0);
});

test('walkerFlags: tight transfer against a neighbouring visit at a far-away client', () => {
  // u1's previous visit ends 12 min before the window, ~5.56 km away (~21 min).
  const travelCtx: PickerContext = {
    ...ctx,
    visits: [
      {
        id: 'v-prev',
        walker_id: 'u1',
        scheduled_start: '2026-08-31T14:18:00Z',
        scheduled_end: '2026-08-31T14:48:00Z',
        client_id: 'client-b',
        client: { lat: 29.8, lng: -95.36 },
      },
    ],
  };
  const slotClient = { id: 'client-a', lat: 29.75, lng: -95.36 };
  expect(walkerFlags('u1', travelCtx, win, CHI, { slotClient })).toEqual({
    available: true,
    onTimeOff: false,
    overlaps: 0,
    tight: { direction: 'from_prev', driveMin: 21, gapMin: 12 },
  });
  // Without slotClient (callers that predate the travel work) the flag is off.
  expect(walkerFlags('u1', travelCtx, win, CHI).tight).toBeNull();
});

test('flagLabel renders the tight-transfer warning in the picker flag style', () => {
  expect(
    flagLabel({
      available: true,
      onTimeOff: false,
      overlaps: 0,
      tight: { direction: 'from_prev', driveMin: 18, gapMin: 12 },
    }),
  ).toBe('Tight transfer (~18 min drive, 12 min gap)');
  expect(flagLabel({ available: true, onTimeOff: false, overlaps: 0, tight: null })).toBe('Available');
});

// ---- memberName ----

test('memberName resolves display names and falls back to a stub', () => {
  const members = [
    { user_id: 'u1', role: 'walker' as const, display_name: 'Riley' },
    { user_id: 'u2', role: 'owner' as const, display_name: null },
  ];
  expect(memberName(members, 'u1')).toBe('Riley');
  expect(memberName(members, 'u2')).toBe('Team member');
  expect(memberName(members, 'nope')).toBe('Team member');
});

// ---- listVisits (column-grant safety: never select price, never select *) ----

test('VISIT_COLUMNS names every readable column and never the price or private notes', () => {
  expect(VISIT_COLUMNS).not.toContain('*');
  expect(VISIT_COLUMNS).not.toContain('price');
  for (const col of ['id', 'walker_id', 'scheduled_start', 'scheduled_end', 'business_tz', 'status']) {
    expect(VISIT_COLUMNS).toContain(col);
  }
  // owner_notes_md / decline_reason left the base grant (2026-08-29 security);
  // merged in from the staff-only visit_private_fields view instead.
  expect(VISIT_COLUMNS).not.toContain('owner_notes_md');
  expect(VISIT_COLUMNS).not.toContain('decline_reason');
});

test('listVisits selects named columns with embeds and a start-time window', async () => {
  mockResults.push({ data: [], error: null });
  await listVisits('b1', {
    fromUtc: new Date('2026-09-01T00:00:00Z'),
    toUtc: new Date('2026-09-15T00:00:00Z'),
  });
  const q = mockLog[0]!;
  expect(q.table).toBe('visits');
  const select = q.steps.find(([n]) => n === 'select')![1][0] as string;
  expect(select).toBe(VISIT_COLUMNS);
  expect(select).toContain('client:clients(name, phones)');
  expect(select).toContain('service:services(name, duration_min)');
  const names = q.steps.map(([n]) => n);
  expect(names).toContain('gte');
  expect(names).toContain('lt');
});

test('listVisits applies the optional status filter', async () => {
  mockResults.push({ data: [], error: null });
  await listVisits('b1', {
    fromUtc: new Date('2026-09-01T00:00:00Z'),
    toUtc: new Date('2026-09-15T00:00:00Z'),
    status: 'unassigned',
  });
  const eqArgs = mockLog[0]!.steps.filter(([n]) => n === 'eq').map(([, a]) => a);
  expect(eqArgs).toContainEqual(['status', 'unassigned']);
});

// ---- createVisit (force-assign rule) ----

const visitInput = {
  businessId: 'b1',
  clientId: 'c1',
  serviceId: 's1',
  petIds: ['p1', 'p2'],
  startUtc: new Date('2026-09-01T14:00:00Z'),
  endUtc: new Date('2026-09-01T14:30:00Z'),
  tz: CHI,
  priceCents: 3000,
};

test('createVisit with no walker inserts a plain unassigned row', async () => {
  mockResults.push({ data: { id: 'v1' }, error: null });
  const out = await createVisit({ ...visitInput, walkerId: null });
  expect(out).toEqual({ id: 'v1' });
  const insert = mockLog[0]!.steps.find(([n]) => n === 'insert')![1][0] as Record<string, unknown>;
  expect(insert.walker_id).toBeUndefined();
  expect(insert.status).toBeUndefined();
  expect(insert.price_cents_snapshot).toBe(3000);
  expect(insert.business_tz).toBe(CHI);
  expect(mockRpc).not.toHaveBeenCalled();
});

test('createVisit self-assign inserts directly as accepted (owner force-assign)', async () => {
  mockUserId = 'me';
  mockResults.push({ data: { id: 'v1' }, error: null });
  await createVisit({ ...visitInput, walkerId: 'me' });
  const insert = mockLog[0]!.steps.find(([n]) => n === 'insert')![1][0] as Record<string, unknown>;
  expect(insert.walker_id).toBe('me');
  expect(insert.status).toBe('accepted');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('createVisit for another walker inserts unassigned then offers via RPC', async () => {
  mockUserId = 'me';
  mockResults.push({ data: { id: 'v1' }, error: null });
  await createVisit({ ...visitInput, walkerId: 'other' });
  const insert = mockLog[0]!.steps.find(([n]) => n === 'insert')![1][0] as Record<string, unknown>;
  expect(insert.walker_id).toBeUndefined();
  expect(insert.status).toBeUndefined();
  expect(mockRpc).toHaveBeenCalledWith('offer_visit', { p_visit: 'v1', p_walker: 'other' });
});

// ---- RPC wrappers ----

test('offerVisit and cancelVisit call their RPCs', async () => {
  await offerVisit('v9', 'w1');
  expect(mockRpc).toHaveBeenCalledWith('offer_visit', { p_visit: 'v9', p_walker: 'w1' });
  await cancelVisit('v9');
  expect(mockRpc).toHaveBeenCalledWith('cancel_visit', { p_visit: 'v9' });
});

// ---- pickerContext ----

test('pickerContext fetches business rules, window time off, and overlapping assigned visits', async () => {
  mockResults.push({ data: [], error: null }, { data: [], error: null }, { data: [], error: null });
  const out = await pickerContext(
    'b1',
    new Date('2026-08-31T15:00:00Z'),
    new Date('2026-08-31T15:30:00Z'),
  );
  expect(out).toEqual({ rules: [], timeOff: [], visits: [] });
  expect(mockLog.map((q) => q.table)).toEqual(['availability_rules', 'time_off', 'visits']);
  const visitsQ = mockLog[2]!;
  const select = visitsQ.steps.find(([n]) => n === 'select')![1][0] as string;
  expect(select).not.toContain('*');
  expect(select).not.toContain('price');
  // Client home coordinates ride along for the tight-transfer check.
  expect(select).toContain('client_id');
  expect(select).toContain('client:clients(lat, lng)');
  // Assigned only, cancelled excluded, half-open overlap on the window.
  const names = visitsQ.steps.map(([n]) => n);
  expect(names).toContain('not');
  expect(names).toContain('neq');
  expect(names).toContain('lt');
  expect(names).toContain('gt');
});

// ---- edit in place (Alexandra, 2026-09-05) ----

test('isEditableStatus: pre-start only', () => {
  expect(isEditableStatus('unassigned')).toBe(true);
  expect(isEditableStatus('offered')).toBe(true);
  expect(isEditableStatus('accepted')).toBe(true);
  expect(isEditableStatus('in_progress')).toBe(false);
  expect(isEditableStatus('completed')).toBe(false);
  expect(isEditableStatus('cancelled')).toBe(false);
});

test('updateVisitDetails re-stamps composition, window, AND the price snapshot', async () => {
  mockResults.push({ data: null, error: null });
  await updateVisitDetails('v1', {
    serviceId: 's2',
    petIds: ['p1', 'p2'],
    priceCents: 3500,
    startUtc: new Date('2026-09-06T14:00:00Z'),
    endUtc: new Date('2026-09-06T14:30:00Z'),
  });
  const q = mockLog[0]!;
  expect(q.table).toBe('visits');
  const update = q.steps.find(([n]) => n === 'update')![1][0] as Record<string, unknown>;
  expect(update).toEqual({
    service_id: 's2',
    pet_ids: ['p1', 'p2'],
    price_cents_snapshot: 3500,
    scheduled_start: '2026-09-06T14:00:00.000Z',
    scheduled_end: '2026-09-06T14:30:00.000Z',
  });
  expect(q.steps.filter(([n]) => n === 'eq').map(([, a]) => a)).toEqual([['id', 'v1']]);
  // No returning select: the price column grant rejects it.
  expect(q.steps.some(([n]) => n === 'select')).toBe(false);
});
