import {
  invoiceHref,
  listPortalInvoices,
  PORTAL_INVOICE_LIST_COLUMNS,
  portalInvoiceVm,
  type PortalInvoiceListRow,
} from '../invoicesApi';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
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
  mockResult = { data: [], error: null };
});

/** Same column contract as portalQueries.test.ts — extended to Task 5 selects. */
const FORBIDDEN = /price_cents_snapshot|owner_notes_md|decline_reason|private_notes_md/;

const NOW = new Date('2026-08-26T12:00:00Z');

function row(over: Partial<PortalInvoiceListRow>): PortalInvoiceListRow {
  return {
    id: 'i1',
    client_id: 'c1',
    number: 7,
    status: 'sent',
    issued_on: '2026-08-24',
    due_on: null,
    public_token: 'tok_i1',
    revoked_at: null,
    items: [{ amount_cents: 4500 }],
    payments: [],
    ...over,
  };
}

test('list columns: named only, no forbidden columns, token + amounts included', () => {
  expect(PORTAL_INVOICE_LIST_COLUMNS).not.toMatch(FORBIDDEN);
  expect(PORTAL_INVOICE_LIST_COLUMNS).toContain('public_token');
  expect(PORTAL_INVOICE_LIST_COLUMNS).toContain('revoked_at');
  expect(PORTAL_INVOICE_LIST_COLUMNS).toContain('items:invoice_items(amount_cents)');
  expect(PORTAL_INVOICE_LIST_COLUMNS).toContain('payments:payments(amount_cents)');
});

test('listPortalInvoices: client scope, sent|paid, newest issue first', async () => {
  await listPortalInvoices('c1');
  expect(mockLog[0]?.table).toBe('invoices');
  expect(mockLog[0]?.steps).toEqual([
    ['select', [PORTAL_INVOICE_LIST_COLUMNS]],
    ['eq', ['client_id', 'c1']],
    ['in', ['status', ['sent', 'paid']]],
    ['order', ['issued_on', { ascending: false }]],
    ['order', ['number', { ascending: false }]],
  ]);
});

test('listPortalInvoices surfaces supabase errors', async () => {
  mockResult = { data: null, error: new Error('boom') };
  await expect(listPortalInvoices('c1')).rejects.toThrow('boom');
});

test('invoiceHref: token deep-links; missing or revoked token does not', () => {
  expect(invoiceHref(row({}))).toBe('/invoice/tok_i1');
  expect(invoiceHref(row({ public_token: null }))).toBeNull();
  expect(invoiceHref(row({ revoked_at: '2026-08-26T00:00:00Z' }))).toBeNull();
});

test('vm: sent invoice — total, balance, Awaiting payment chip, href', () => {
  const vm = portalInvoiceVm(row({ payments: [{ amount_cents: 1000 }] }), NOW);
  expect(vm.numberLabel).toBe('INV-0007');
  expect(vm.dateLine).toBe('Issued Aug 24, 2026');
  expect(vm.totalText).toBe('$45.00');
  expect(vm.balanceText).toBe('$35.00');
  expect(vm.unpaid).toBe(true);
  // Partial payment keeps the shared chip precedence, not the rename.
  expect(vm.chip).toEqual({ label: 'Partially paid', tone: 'warning' });
  expect(vm.href).toBe('/invoice/tok_i1');
});

test('vm: sent with no payments reads Awaiting payment', () => {
  const vm = portalInvoiceVm(row({}), NOW);
  expect(vm.chip).toEqual({ label: 'Awaiting payment', tone: 'neutral' });
  expect(vm.balanceText).toBe('$45.00');
});

test('vm: overdue outranks the Awaiting payment rename', () => {
  const vm = portalInvoiceVm(row({ due_on: '2026-08-20' }), NOW);
  expect(vm.chip).toEqual({ label: 'Overdue', tone: 'danger' });
});

test('vm: paid invoice — green chip, zero balance, not unpaid', () => {
  const vm = portalInvoiceVm(
    row({ status: 'paid', payments: [{ amount_cents: 4500 }] }),
    NOW,
  );
  expect(vm.chip).toEqual({ label: 'Paid', tone: 'green' });
  expect(vm.balanceText).toBe('$0.00');
  expect(vm.unpaid).toBe(false);
});

test('vm: credits (negative items) flow through the shared math', () => {
  const vm = portalInvoiceVm(
    row({ items: [{ amount_cents: 4500 }, { amount_cents: -500 }] }),
    NOW,
  );
  expect(vm.totalText).toBe('$40.00');
  expect(vm.balanceText).toBe('$40.00');
});
