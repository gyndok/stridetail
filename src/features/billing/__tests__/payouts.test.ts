import {
  addPayoutItem,
  createPayoutStatement,
  finalizePayout,
  getPayoutStatement,
  listMyPayoutStatements,
  listPayoutStatements,
  markPayoutPaid,
  walkerOwedTotal,
  PAYOUT_DETAIL_COLUMNS,
  PAYOUT_LIST_COLUMNS,
  payoutStatusChip,
  periodLabel,
  signedDollarsToCents,
  voidPayoutStatement,
} from '../payouts';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
const mockRpcLog: { fn: string; args: unknown }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };
let mockRpcResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockSession: { user: { id: string } } | null = { user: { id: 'walker-1' } };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'order', 'single']) {
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
      return Promise.resolve(mockRpcResult);
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
  mockRpcResult = { data: null, error: null };
  mockSession = { user: { id: 'walker-1' } };
});

function steps() {
  return mockLog[0]!.steps;
}
function argsOf(name: string) {
  return steps()
    .filter(([n]) => n === name)
    .map(([, a]) => a);
}

test('no payout column list contains a *', () => {
  expect(PAYOUT_LIST_COLUMNS).not.toContain('*');
  expect(PAYOUT_DETAIL_COLUMNS).not.toContain('*');
});

// walker_id references auth.users with no profiles FK (visits precedent), so
// a walker:profiles(...) embed is impossible — names join client-side.
test('payout columns never attempt a profiles embed', () => {
  expect(PAYOUT_LIST_COLUMNS).not.toContain('profiles');
  expect(PAYOUT_DETAIL_COLUMNS).not.toContain('profiles');
});

describe('listPayoutStatements', () => {
  test('business-scoped, named columns, newest first', async () => {
    await listPayoutStatements('biz-1');
    expect(mockLog[0]!.table).toBe('payout_statements');
    expect(argsOf('select')).toEqual([[PAYOUT_LIST_COLUMNS]]);
    expect(argsOf('eq')).toEqual([['business_id', 'biz-1']]);
    expect(argsOf('order')).toEqual([['created_at', { ascending: false }]]);
  });

  test('throws on error', async () => {
    mockResult = { data: null, error: new Error('boom') };
    await expect(listPayoutStatements('biz-1')).rejects.toThrow('boom');
  });
});

describe('getPayoutStatement', () => {
  test('scopes to business and id, single row, items embed', async () => {
    mockResult = { data: { id: 'st-1' }, error: null };
    await getPayoutStatement('biz-1', 'st-1');
    expect(mockLog[0]!.table).toBe('payout_statements');
    const select = argsOf('select')[0]![0] as string;
    expect(select).toContain('items:payout_items(id, visit_id, description, amount_cents, created_at)');
    expect(argsOf('eq')).toEqual([
      ['business_id', 'biz-1'],
      ['id', 'st-1'],
    ]);
    expect(steps().map(([n]) => n)).toContain('single');
  });
});

describe('listMyPayoutStatements', () => {
  test('scopes to business + own walker_id, excludes drafts, newest first', async () => {
    await listMyPayoutStatements('biz-1');
    expect(mockLog[0]!.table).toBe('payout_statements');
    expect(argsOf('select')).toEqual([[PAYOUT_DETAIL_COLUMNS]]);
    expect(argsOf('eq')).toEqual([
      ['business_id', 'biz-1'],
      ['walker_id', 'walker-1'],
    ]);
    expect(argsOf('neq')).toEqual([['status', 'draft']]);
    expect(argsOf('order')).toEqual([['created_at', { ascending: false }]]);
  });

  test('signed-out resolves empty without querying', async () => {
    mockSession = null;
    await expect(listMyPayoutStatements('biz-1')).resolves.toEqual([]);
    expect(mockLog).toHaveLength(0);
  });
});

describe('rpc wrappers', () => {
  test('createPayoutStatement passes walker and full period', async () => {
    mockRpcResult = { data: 'st-1', error: null };
    const id = await createPayoutStatement('walker-1', '2026-08-01', '2026-08-15');
    expect(mockRpcLog).toEqual([
      {
        fn: 'create_payout_statement',
        args: { p_walker: 'walker-1', p_from: '2026-08-01', p_to: '2026-08-15' },
      },
    ]);
    expect(id).toBe('st-1');
  });

  test('addPayoutItem carries the signed cents', async () => {
    mockRpcResult = { data: 'item-1', error: null };
    await addPayoutItem('st-1', 'Gas correction', -500);
    expect(mockRpcLog).toEqual([
      {
        fn: 'add_payout_item',
        args: { p_statement: 'st-1', p_description: 'Gas correction', p_amount_cents: -500 },
      },
    ]);
  });

  test('finalize / mark paid / void', async () => {
    await finalizePayout('st-1');
    await markPayoutPaid('st-1');
    await voidPayoutStatement('st-1');
    expect(mockRpcLog).toEqual([
      { fn: 'finalize_payout', args: { p_statement: 'st-1' } },
      { fn: 'mark_payout_paid', args: { p_statement: 'st-1' } },
      { fn: 'void_payout_statement', args: { p_statement: 'st-1' } },
    ]);
  });

  test('rpc errors throw', async () => {
    mockRpcResult = { data: null, error: new Error('nope') };
    await expect(finalizePayout('st-1')).rejects.toThrow('nope');
  });
});

// ---- pure helpers ----

test('payoutStatusChip: draft muted, finalized warns awaiting payment, paid green', () => {
  expect(payoutStatusChip('draft')).toEqual({ label: 'Draft', tone: 'muted' });
  expect(payoutStatusChip('finalized')).toEqual({ label: 'Awaiting payment', tone: 'warning' });
  expect(payoutStatusChip('paid')).toEqual({ label: 'Paid', tone: 'green' });
});

describe('periodLabel', () => {
  test('same year states it once', () => {
    expect(periodLabel('2026-08-01', '2026-08-15')).toBe('Aug 1 – Aug 15, 2026');
  });

  test('cross-year states both years', () => {
    expect(periodLabel('2026-12-29', '2027-01-04')).toBe('Dec 29, 2026 – Jan 4, 2027');
  });

  test('single-day periods still read as a range', () => {
    expect(periodLabel('2026-08-25', '2026-08-25')).toBe('Aug 25 – Aug 25, 2026');
  });

  test('malformed input passes through', () => {
    expect(periodLabel('junk', '2026-08-15')).toBe('junk – 2026-08-15');
  });
});

describe('signedDollarsToCents', () => {
  test('positive amounts match the strict parser', () => {
    expect(signedDollarsToCents('5')).toBe(500);
    expect(signedDollarsToCents('12.50')).toBe(1250);
    expect(signedDollarsToCents(' $8.5 ')).toBe(850);
  });

  test('a leading minus flips the sign', () => {
    expect(signedDollarsToCents('-5.25')).toBe(-525);
    expect(signedDollarsToCents('-$3')).toBe(-300);
  });

  test('zero parses (the RPC rejects it with its own message)', () => {
    expect(signedDollarsToCents('0')).toBe(0);
    expect(signedDollarsToCents('-0')).toBe(-0);
  });

  test('junk is null', () => {
    expect(signedDollarsToCents('')).toBeNull();
    expect(signedDollarsToCents('five')).toBeNull();
    expect(signedDollarsToCents('1.234')).toBeNull();
    expect(signedDollarsToCents('--5')).toBeNull();
  });
});

describe('walkerOwedTotal (money-review fix A)', () => {
  const base = {
    walker_id: 'w1',
    display_name: 'Kelly',
    payout_percent: 75 as number | null,
    wages_cents: 0,
    tips_cents: 0,
    statement_cents: 0,
  };

  test('sums the three disjoint parts', () => {
    expect(walkerOwedTotal({ ...base, wages_cents: 3750, tips_cents: 1000, statement_cents: 0 })).toBe(4750);
    // Drafting a statement moves money between parts; the total is unchanged.
    expect(walkerOwedTotal({ ...base, wages_cents: 0, tips_cents: 0, statement_cents: 4750 })).toBe(4750);
  });

  test('a departed walker (null percent) still totals their statements', () => {
    expect(
      walkerOwedTotal({ ...base, payout_percent: null, statement_cents: 1200 }),
    ).toBe(1200);
  });
});
