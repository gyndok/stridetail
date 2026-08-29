import {
  BALANCE_DEPOSIT_COLUMNS,
  BALANCE_INVOICE_COLUMNS,
  balanceView,
  clientBalances,
  fetchBalanceInputs,
  type BalanceInputs,
} from '../clientBalances';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResults: Record<string, { data: unknown; error: unknown }> = {};

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve(mockResults[table] ?? { data: [], error: null }));
      return builder;
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResults = {};
});

describe('fetchBalanceInputs', () => {
  test('named columns, business scoped, held deposits and sent invoices only', async () => {
    await fetchBalanceInputs('biz-1');
    const deposits = mockLog.find((e) => e.table === 'deposits')!;
    const invoices = mockLog.find((e) => e.table === 'invoices')!;
    expect(BALANCE_DEPOSIT_COLUMNS).not.toContain('*');
    expect(BALANCE_INVOICE_COLUMNS).not.toContain('*');
    expect(deposits.steps).toEqual([
      ['select', [BALANCE_DEPOSIT_COLUMNS]],
      ['eq', ['business_id', 'biz-1']],
      ['eq', ['status', 'held']],
    ]);
    expect(invoices.steps).toEqual([
      ['select', [BALANCE_INVOICE_COLUMNS]],
      ['eq', ['business_id', 'biz-1']],
      ['eq', ['status', 'sent']],
    ]);
  });

  test('throws on either query error', async () => {
    mockResults = { deposits: { data: null, error: new Error('boom') } };
    await expect(fetchBalanceInputs('biz-1')).rejects.toThrow('boom');
  });
});

describe('clientBalances', () => {
  const inputs: BalanceInputs = {
    heldDeposits: [
      { client_id: 'a', amount_cents: 5000 },
      { client_id: 'a', amount_cents: 1000 },
      { client_id: 'b', amount_cents: 2000 },
    ],
    sentInvoices: [
      {
        client_id: 'b',
        items: [{ amount_cents: 3000 }, { amount_cents: 2000 }],
        payments: [{ amount_cents: 1000 }],
      },
      { client_id: 'c', items: [{ amount_cents: 2500 }], payments: [] },
      { client_id: 'c', items: [{ amount_cents: 500 }], payments: [] },
    ],
  };

  test('nets held deposits against outstanding sent balances, per client', () => {
    const balances = clientBalances(inputs);
    expect(balances.get('a')).toBe(6000); // two deposits, nothing owed
    expect(balances.get('b')).toBe(-2000); // 2000 held − (5000 − 1000) owed
    expect(balances.get('c')).toBe(-3000); // two unpaid invoices
    expect(balances.get('d')).toBeUndefined(); // no billing rows at all
  });

  test('empty inputs give an empty map', () => {
    expect(clientBalances({ heldDeposits: [], sentInvoices: [] }).size).toBe(0);
  });
});

describe('balanceView', () => {
  test('positive is a green credit, negative a red owes', () => {
    expect(balanceView(6000)).toEqual({ text: '$60.00 credit', tone: 'green' });
    expect(balanceView(-2000)).toEqual({ text: 'Owes $20.00', tone: 'danger' });
  });

  test('settled and unknown are null — the glance stays quiet', () => {
    expect(balanceView(0)).toBeNull();
    expect(balanceView(undefined)).toBeNull();
  });
});
