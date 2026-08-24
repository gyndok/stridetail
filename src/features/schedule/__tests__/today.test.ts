import {
  MY_VISIT_COLUMNS,
  acceptVisit,
  declineVisit,
  groupTodayByWalker,
  joinServices,
  listMyVisits,
  partitionWalkerDay,
  visitTimeRange,
  visitsOnLocalDay,
  type ScheduleMember,
} from '../api';

// ---- supabase mock (same shape as visits.test.ts) ----

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
// One result per awaited query, consumed in order (listMyVisits runs two).
const mockResults: { data: unknown; error: unknown }[] = [];
const mockRpc = jest.fn(async () => ({ data: null, error: null }));

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
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResults.length = 0;
  mockRpc.mockClear();
});

const CHI = 'America/Chicago';

// ---- MY_VISIT_COLUMNS (walker read shape) ----

test('MY_VISIT_COLUMNS names columns, never the price, and has NO services embed', () => {
  expect(MY_VISIT_COLUMNS).not.toContain('*');
  expect(MY_VISIT_COLUMNS).not.toContain('price');
  // services select policy is owner-only; a services embed is null under
  // walker RLS, so the walker read must not carry one.
  expect(MY_VISIT_COLUMNS).not.toContain('services(');
  expect(MY_VISIT_COLUMNS).toContain('client:clients(name)');
  for (const col of ['id', 'service_id', 'walker_id', 'scheduled_start', 'scheduled_end', 'business_tz', 'status', 'decline_reason']) {
    expect(MY_VISIT_COLUMNS).toContain(col);
  }
});

// ---- listMyVisits query shape ----

test('listMyVisits reads visits (named columns, window, cancelled excluded) then services_public', async () => {
  mockResults.push(
    { data: [{ id: 'v1', service_id: 's1' }], error: null },
    { data: [{ id: 's1', name: 'Walk 30', duration_min: 30 }], error: null },
  );
  const out = await listMyVisits('b1', new Date('2026-09-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'));
  expect(mockLog.map((q) => q.table)).toEqual(['visits', 'services_public']);

  const visitsQ = mockLog[0]!;
  const select = visitsQ.steps.find(([n]) => n === 'select')![1][0] as string;
  expect(select).toBe(MY_VISIT_COLUMNS);
  const names = visitsQ.steps.map(([n]) => n);
  expect(names).toContain('gte');
  expect(names).toContain('lt');
  expect(names).toContain('order');
  // No walker_id filter: RLS already pins walkers to their own rows.
  const eqArgs = visitsQ.steps.filter(([n]) => n === 'eq').map(([, a]) => a);
  expect(eqArgs).toEqual([['business_id', 'b1']]);
  const neqArgs = visitsQ.steps.filter(([n]) => n === 'neq').map(([, a]) => a);
  expect(neqArgs).toContainEqual(['status', 'cancelled']);

  const svcSelect = mockLog[1]!.steps.find(([n]) => n === 'select')![1][0] as string;
  expect(svcSelect).not.toContain('*');
  expect(svcSelect).not.toContain('price');

  // Service names joined client-side.
  expect(out[0]!.service).toEqual({ name: 'Walk 30', duration_min: 30 });
});

test('joinServices fills matches and leaves unknown services null', () => {
  const joined = joinServices(
    [{ service_id: 's1' }, { service_id: 's-gone' }],
    [{ id: 's1', name: 'Walk 30', duration_min: 30 }],
  );
  expect(joined[0]!.service).toEqual({ name: 'Walk 30', duration_min: 30 });
  expect(joined[1]!.service).toBeNull();
});

// ---- accept/decline RPC wrappers ----

test('acceptVisit and declineVisit call their RPCs', async () => {
  await acceptVisit('v9');
  expect(mockRpc).toHaveBeenCalledWith('accept_visit', { p_visit: 'v9' });
  await declineVisit('v9', 'car broke down');
  expect(mockRpc).toHaveBeenCalledWith('decline_visit', { p_visit: 'v9', p_reason: 'car broke down' });
});

// ---- visitTimeRange (business-tz rendering) ----

test('visitTimeRange renders the local wall-clock range in the visit business tz', () => {
  const v = {
    scheduled_start: '2026-09-01T14:00:00Z', // 09:00 CDT
    scheduled_end: '2026-09-01T14:30:00Z',
    business_tz: CHI,
  };
  expect(visitTimeRange(v)).toBe('09:00 – 09:30');
});

// ---- visitsOnLocalDay ----

// "Now": 2026-09-01 21:30 Chicago = 2026-09-02T02:30Z.
const NOW = new Date('2026-09-02T02:30:00Z');

test('visitsOnLocalDay keeps visits on the LOCAL day of now, per visit tz', () => {
  const rows = [
    { id: 'late-tonight', scheduled_start: '2026-09-02T03:00:00Z', business_tz: CHI }, // Sep 1, 22:00 CDT
    { id: 'this-morning', scheduled_start: '2026-09-01T14:00:00Z', business_tz: CHI }, // Sep 1, 09:00 CDT
    { id: 'tomorrow', scheduled_start: '2026-09-02T14:00:00Z', business_tz: CHI }, // Sep 2, 09:00 CDT
  ];
  expect(visitsOnLocalDay(rows, NOW).map((v) => v.id)).toEqual(['late-tonight', 'this-morning']);
});

// ---- partitionWalkerDay (offered vs accepted-today) ----

test('partitionWalkerDay: offers are ANY date sorted soonest first; today is accepted on the local day', () => {
  const rows = [
    { id: 'offer-far', status: 'offered', scheduled_start: '2026-09-10T14:00:00Z', business_tz: CHI },
    { id: 'offer-soon', status: 'offered', scheduled_start: '2026-09-02T03:00:00Z', business_tz: CHI },
    { id: 'today-late', status: 'accepted', scheduled_start: '2026-09-02T03:30:00Z', business_tz: CHI },
    { id: 'today-early', status: 'accepted', scheduled_start: '2026-09-01T14:00:00Z', business_tz: CHI },
    { id: 'accepted-tomorrow', status: 'accepted', scheduled_start: '2026-09-02T14:00:00Z', business_tz: CHI },
  ];
  const { offers, today } = partitionWalkerDay(rows, NOW);
  expect(offers.map((v) => v.id)).toEqual(['offer-soon', 'offer-far']);
  expect(today.map((v) => v.id)).toEqual(['today-early', 'today-late']);
});

// ---- groupTodayByWalker ----

const members: ScheduleMember[] = [
  { user_id: 'o1', role: 'owner', display_name: 'Olive' },
  { user_id: 'w-zed', role: 'walker', display_name: 'Zed' },
  { user_id: 'w-amy', role: 'walker', display_name: 'Amy' },
];

function gv(id: string, walkerId: string | null, status: string, start: string) {
  return { id, walker_id: walkerId, status, scheduled_start: start, business_tz: CHI };
}

test('groupTodayByWalker: owner first, walkers alphabetical, Unassigned last, cancelled dropped', () => {
  const rows = [
    gv('z1', 'w-zed', 'accepted', '2026-09-01T14:00:00Z'),
    gv('u1', null, 'unassigned', '2026-09-01T15:00:00Z'),
    gv('a2', 'w-amy', 'accepted', '2026-09-01T16:00:00Z'),
    gv('a1', 'w-amy', 'offered', '2026-09-01T14:30:00Z'),
    gv('o1v', 'o1', 'accepted', '2026-09-01T17:00:00Z'),
    gv('gone', 'w-zed', 'cancelled', '2026-09-01T18:00:00Z'),
  ];
  const groups = groupTodayByWalker(rows, members);
  expect(groups.map((g) => g.name)).toEqual(['Olive', 'Amy', 'Zed', 'Unassigned']);
  // Visits inside a group sort by start time.
  expect(groups[1]!.visits.map((v) => v.id)).toEqual(['a1', 'a2']);
  expect(groups[3]!.visits.map((v) => v.id)).toEqual(['u1']);
});

test('groupTodayByWalker drops empty groups (members with no visits today)', () => {
  const groups = groupTodayByWalker([gv('z1', 'w-zed', 'accepted', '2026-09-01T14:00:00Z')], members);
  expect(groups.map((g) => g.name)).toEqual(['Zed']);
});
