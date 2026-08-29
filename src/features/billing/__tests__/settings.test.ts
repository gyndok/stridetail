import {
  AUTO_INVOICE_MODES,
  BUSINESS_BILLING_COLUMNS,
  getBusinessBilling,
  normalizeContactHandle,
  normalizeVenmoHandle,
  updateBusinessBilling,
} from '../settings';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'update', 'eq', 'single']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(mockResult));
      return builder;
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockResult = { data: null, error: null };
});

function argsOf(name: string) {
  return mockLog[0]!.steps.filter(([n]) => n === name).map(([, a]) => a);
}

test('the modes mirror the check constraint, per_visit (the default) first', () => {
  expect(AUTO_INVOICE_MODES.map((m) => m.value)).toEqual(['per_visit', 'per_sitting', 'manual']);
  for (const m of AUTO_INVOICE_MODES) {
    expect(m.label.length).toBeGreaterThan(0);
    expect(m.hint.length).toBeGreaterThan(0);
  }
});

describe('getBusinessBilling', () => {
  test('named columns, scoped to the id, single row', async () => {
    mockResult = { data: { id: 'biz-1' }, error: null };
    await getBusinessBilling('biz-1');
    expect(mockLog[0]!.table).toBe('businesses');
    expect(BUSINESS_BILLING_COLUMNS).not.toContain('*');
    expect(argsOf('select')).toEqual([[BUSINESS_BILLING_COLUMNS]]);
    expect(argsOf('eq')).toEqual([['id', 'biz-1']]);
    expect(mockLog[0]!.steps.map(([n]) => n)).toContain('single');
  });

  test('throws on error', async () => {
    mockResult = { data: null, error: new Error('boom') };
    await expect(getBusinessBilling('biz-1')).rejects.toThrow('boom');
  });
});

describe('updateBusinessBilling', () => {
  test('updates exactly the settings columns, scoped to the id', async () => {
    await updateBusinessBilling('biz-1', {
      auto_invoice: 'per_sitting',
      venmo_handle: 'alex',
      zelle_handle: '555-010-0100',
      apple_pay_handle: 'alex@example.com',
      payment_instructions_md: 'Checks payable to Alex',
    });
    expect(mockLog[0]!.table).toBe('businesses');
    expect(argsOf('update')).toEqual([
      [
        {
          auto_invoice: 'per_sitting',
          venmo_handle: 'alex',
          zelle_handle: '555-010-0100',
          apple_pay_handle: 'alex@example.com',
          payment_instructions_md: 'Checks payable to Alex',
        },
      ],
    ]);
    expect(argsOf('eq')).toEqual([['id', 'biz-1']]);
  });

  test('throws on error', async () => {
    mockResult = { data: null, error: new Error('denied') };
    await expect(
      updateBusinessBilling('biz-1', {
        auto_invoice: 'manual',
        venmo_handle: null,
        zelle_handle: null,
        apple_pay_handle: null,
        payment_instructions_md: null,
      }),
    ).rejects.toThrow('denied');
  });
});

describe('normalizeVenmoHandle', () => {
  test('strips the leading @ and surrounding whitespace', () => {
    expect(normalizeVenmoHandle('@alex')).toBe('alex');
    expect(normalizeVenmoHandle(' @alex-walks ')).toBe('alex-walks');
    expect(normalizeVenmoHandle('alex')).toBe('alex');
    expect(normalizeVenmoHandle('@@alex')).toBe('alex');
  });

  test('blank (or a bare @) is null — hides the public Venmo button', () => {
    expect(normalizeVenmoHandle('')).toBeNull();
    expect(normalizeVenmoHandle('   ')).toBeNull();
    expect(normalizeVenmoHandle('@')).toBeNull();
  });

  test('interior @ survives (only the prefix is user noise)', () => {
    expect(normalizeVenmoHandle('a@b')).toBe('a@b');
  });
});

describe('normalizeContactHandle (Zelle / Apple Pay)', () => {
  test('trims whitespace but keeps the text verbatim — emails and phones both', () => {
    expect(normalizeContactHandle(' alex@example.com ')).toBe('alex@example.com');
    expect(normalizeContactHandle('555-010-0100')).toBe('555-010-0100');
  });

  test('blank is null — hides that payment row on the invoice', () => {
    expect(normalizeContactHandle('')).toBeNull();
    expect(normalizeContactHandle('   ')).toBeNull();
  });
});
