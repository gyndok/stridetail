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

  test('keeps owed and held APART, per client — deposits never hide debt', () => {
    // Money-review fix B: client b owes 4000 AND we hold 2000; the old signed
    // net (-2000) understated the debt, and a larger deposit hid it entirely.
    const balances = clientBalances(inputs);
    expect(balances.get('a')).toEqual({ owedCents: 0, heldCents: 6000 });
    expect(balances.get('b')).toEqual({ owedCents: 4000, heldCents: 2000 });
    expect(balances.get('c')).toEqual({ owedCents: 3000, heldCents: 0 });
    expect(balances.get('d')).toBeUndefined(); // no billing rows at all
  });

  test('a deposit larger than the debt still shows the unpaid invoice', () => {
    const balances = clientBalances({
      heldDeposits: [{ client_id: 'e', amount_cents: 5000 }],
      sentInvoices: [{ client_id: 'e', items: [{ amount_cents: 2500 }], payments: [] }],
    });
    expect(balances.get('e')).toEqual({ owedCents: 2500, heldCents: 5000 });
  });

  test('empty inputs give an empty map', () => {
    expect(clientBalances({ heldDeposits: [], sentInvoices: [] }).size).toBe(0);
  });
});

describe('balanceView', () => {
  test('owed is a red part, held a green part — both shown together', () => {
    expect(balanceView({ owedCents: 2500, heldCents: 5000 })).toEqual([
      { text: 'Owes $25.00', tone: 'danger' },
      { text: 'Holding $50.00', tone: 'green' },
    ]);
    expect(balanceView({ owedCents: 3000, heldCents: 0 })).toEqual([
      { text: 'Owes $30.00', tone: 'danger' },
    ]);
    expect(balanceView({ owedCents: 0, heldCents: 6000 })).toEqual([
      { text: 'Holding $60.00', tone: 'green' },
    ]);
  });

  test('an overpaid invoice reads as a real credit, not a negative owe', () => {
    expect(balanceView({ owedCents: -500, heldCents: 0 })).toEqual([
      { text: '$5.00 credit', tone: 'green' },
    ]);
  });

  test('settled and unknown are null — the glance stays quiet', () => {
    expect(balanceView({ owedCents: 0, heldCents: 0 })).toBeNull();
    expect(balanceView(undefined)).toBeNull();
  });
});
