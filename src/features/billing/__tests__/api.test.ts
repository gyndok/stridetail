import {
  addInvoiceItem,
  createInvoice,
  forfeitDeposit,
  getInvoice,
  groupHeldDeposits,
  INVOICE_DETAIL_COLUMNS,
  INVOICE_LIST_COLUMNS,
  isVisitInvoiced,
  listAllDeposits,
  listHeldDeposits,
  listInvoices,
  listUninvoicedVisits,
  recordDeposit,
  recordPayment,
  refundDeposit,
  removeInvoiceItem,
  resendInvoiceEmail,
  sendInvoice,
  UNINVOICED_VISIT_COLUMNS,
  uninvoicedVisitAmounts,
  voidInvoice,
  type HeldDeposit,
} from '../api';

type Step = [string, unknown[]];
const mockLog: { table: string; steps: Step[] }[] = [];
const mockRpcLog: { fn: string; args: unknown }[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };
// Per-table override for multi-query functions (listUninvoicedVisits reads
// two tables in one call); falls back to mockResult.
let mockResultByTable: Record<string, { data: unknown; error: unknown }> = {};
let mockRpcResult: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, steps: [] as Step[] };
      mockLog.push(entry);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'limit', 'order', 'single']) {
        builder[m] = (...args: unknown[]) => {
          entry.steps.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve(mockResultByTable[table] ?? mockResult));
      return builder;
    },
    rpc: (fn: string, args: unknown) => {
      mockRpcLog.push({ fn, args });
      return Promise.resolve(mockRpcResult);
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockRpcLog.length = 0;
  mockResult = { data: [], error: null };
  mockResultByTable = {};
  mockRpcResult = { data: null, error: null };
});

function steps() {
  return mockLog[0]!.steps;
}
function argsOf(name: string) {
  return steps()
    .filter(([n]) => n === name)
    .map(([, a]) => a);
}

// The visits price column grant makes select('*') a 42501 on visits; billing
// tables allow it, but the house rule is named columns everywhere.
test('no billing column list contains a *', () => {
  expect(INVOICE_LIST_COLUMNS).not.toContain('*');
  expect(INVOICE_DETAIL_COLUMNS).not.toContain('*');
  expect(UNINVOICED_VISIT_COLUMNS).not.toContain('*');
});

// The visits price column grant means the snapshot is NOT readable from the
// table; true amounts come from the uninvoiced_visit_amounts RPC (Plan 6
// Task 4), so the row columns carry the service NAME only — no price at all.
test('uninvoiced-visit columns carry the service name only, never any price', () => {
  expect(UNINVOICED_VISIT_COLUMNS).not.toContain('price');
  expect(UNINVOICED_VISIT_COLUMNS).toContain('service:services(name)');
});

describe('listInvoices', () => {
  test('scopes to the business, embeds named columns, newest number first', async () => {
    await listInvoices('biz-1');
    expect(mockLog[0]!.table).toBe('invoices');
    const select = argsOf('select')[0]![0] as string;
    expect(select).toContain('client:clients(name)');
    expect(select).toContain('items:invoice_items(amount_cents)');
    expect(select).toContain('payments:payments(amount_cents)');
    expect(select).not.toContain('*');
    expect(argsOf('eq')).toEqual([['business_id', 'biz-1']]);
    expect(argsOf('order')).toEqual([['number', { ascending: false }]]);
  });

  test('throws on error', async () => {
    mockResult = { data: null, error: new Error('boom') };
    await expect(listInvoices('biz-1')).rejects.toThrow('boom');
  });
});

describe('getInvoice', () => {
  test('scopes to business and id, single row, named item/payment columns', async () => {
    mockResult = { data: { id: 'inv-1' }, error: null };
    await getInvoice('biz-1', 'inv-1');
    expect(mockLog[0]!.table).toBe('invoices');
    const select = argsOf('select')[0]![0] as string;
    expect(select).toContain('client:clients(name, phones)');
    expect(select).toContain('items:invoice_items(');
    expect(select).toContain('payments:payments(');
    expect(select).not.toContain('*');
    expect(argsOf('eq')).toEqual([
      ['business_id', 'biz-1'],
      ['id', 'inv-1'],
    ]);
    expect(steps().map(([n]) => n)).toContain('single');
  });
});

describe('listHeldDeposits', () => {
  test('held only, business-scoped, oldest received first (nulls last)', async () => {
    await listHeldDeposits('biz-1');
    expect(mockLog[0]!.table).toBe('deposits');
    const select = argsOf('select')[0]![0] as string;
    expect(select).toContain('client:clients(name)');
    expect(select).not.toContain('*');
    expect(argsOf('eq')).toEqual([
      ['business_id', 'biz-1'],
      ['status', 'held'],
    ]);
    expect(argsOf('order')).toEqual([
      ['received_on', { ascending: true, nullsFirst: false }],
      ['created_at', {}],
    ]);
  });
});

describe('groupHeldDeposits', () => {
  const dep = (id: string, client_id: string, name: string | null, amount: number): HeldDeposit => ({
    id,
    client_id,
    amount_cents: amount,
    status: 'held',
    method: null,
    received_on: null,
    memo: null,
    created_at: '2026-08-01T00:00:00Z',
    client: name === null ? null : { name },
  });

  test('groups per client with totals, sorted by client name', () => {
    const groups = groupHeldDeposits([
      dep('d1', 'c-zoe', 'Zoe', 1000),
      dep('d2', 'c-amy', 'Amy', 2500),
      dep('d3', 'c-zoe', 'Zoe', 500),
    ]);
    expect(groups.map((g) => g.clientName)).toEqual(['Amy', 'Zoe']);
    expect(groups[0]).toMatchObject({ clientId: 'c-amy', totalCents: 2500 });
    expect(groups[1]).toMatchObject({ clientId: 'c-zoe', totalCents: 1500 });
    expect(groups[1]!.deposits.map((d) => d.id)).toEqual(['d1', 'd3']);
  });

  test('empty ledger groups to nothing; missing client name gets a fallback', () => {
    expect(groupHeldDeposits([])).toEqual([]);
    expect(groupHeldDeposits([dep('d1', 'c1', null, 100)])[0]!.clientName).toBe('Client');
  });
});

describe('listAllDeposits', () => {
  test('business-scoped, no status filter, same queue order as the held view', async () => {
    await listAllDeposits('biz-1');
    expect(mockLog[0]!.table).toBe('deposits');
    expect(argsOf('eq')).toEqual([['business_id', 'biz-1']]);
    expect(argsOf('order')).toEqual([
      ['received_on', { ascending: true, nullsFirst: false }],
      ['created_at', {}],
    ]);
  });
});

describe('listUninvoicedVisits', () => {
  function entryFor(table: string) {
    const entry = mockLog.find((e) => e.table === table);
    expect(entry).toBeDefined();
    return entry!;
  }

  test('queries completed client visits and the invoiced ids, both business-scoped', async () => {
    await listUninvoicedVisits('biz-1', 'client-1');
    const visits = entryFor('visits');
    expect(visits.steps.filter(([n]) => n === 'eq').map(([, a]) => a)).toEqual([
      ['business_id', 'biz-1'],
      ['client_id', 'client-1'],
      ['status', 'completed'],
    ]);
    expect(visits.steps.filter(([n]) => n === 'order').map(([, a]) => a)).toEqual([
      ['scheduled_start', { ascending: true }],
    ]);
    expect(visits.steps.find(([n]) => n === 'select')![1]).toEqual([UNINVOICED_VISIT_COLUMNS]);
    const items = entryFor('invoice_items');
    expect(items.steps.filter(([n]) => n === 'eq').map(([, a]) => a)).toEqual([
      ['business_id', 'biz-1'],
    ]);
    expect(items.steps.filter(([n]) => n === 'not').map(([, a]) => a)).toEqual([
      ['visit_id', 'is', null],
    ]);
  });

  test('filters out visits that already have an invoice_items row (NOT EXISTS mirror)', async () => {
    mockResultByTable = {
      visits: { data: [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }], error: null },
      invoice_items: { data: [{ visit_id: 'v2' }], error: null },
    };
    const rows = await listUninvoicedVisits('biz-1', 'client-1');
    expect(rows.map((v) => v.id)).toEqual(['v1', 'v3']);
  });

  test('throws when either read fails', async () => {
    mockResultByTable = { invoice_items: { data: null, error: new Error('boom') } };
    await expect(listUninvoicedVisits('biz-1', 'client-1')).rejects.toThrow('boom');
  });
});

describe('isVisitInvoiced', () => {
  test('business-scoped invoice_items probe by visit_id, limit 1', async () => {
    mockResult = { data: [{ id: 'item-1' }], error: null };
    await expect(isVisitInvoiced('biz-1', 'v1')).resolves.toBe(true);
    expect(mockLog[0]!.table).toBe('invoice_items');
    expect(argsOf('eq')).toEqual([
      ['business_id', 'biz-1'],
      ['visit_id', 'v1'],
    ]);
    expect(argsOf('limit')).toEqual([[1]]);
  });

  test('no row means not invoiced', async () => {
    mockResult = { data: [], error: null };
    await expect(isVisitInvoiced('biz-1', 'v1')).resolves.toBe(false);
  });
});

describe('rpc wrappers', () => {
  test('createInvoice defaults the date range to null', async () => {
    mockRpcResult = { data: 'inv-1', error: null };
    const id = await createInvoice('client-1');
    expect(mockRpcLog).toEqual([
      { fn: 'create_invoice', args: { p_client: 'client-1', p_from: null, p_to: null } },
    ]);
    expect(id).toBe('inv-1');
  });

  test('createInvoice passes the given range', async () => {
    mockRpcResult = { data: 'inv-1', error: null };
    await createInvoice('client-1', '2026-08-01', '2026-08-24');
    expect(mockRpcLog[0]!.args).toEqual({
      p_client: 'client-1',
      p_from: '2026-08-01',
      p_to: '2026-08-24',
    });
  });

  test('addInvoiceItem / removeInvoiceItem', async () => {
    mockRpcResult = { data: 'item-1', error: null };
    await addInvoiceItem('inv-1', 'Tip', -500);
    await removeInvoiceItem('item-1');
    expect(mockRpcLog).toEqual([
      {
        fn: 'add_invoice_item',
        args: { p_invoice: 'inv-1', p_description: 'Tip', p_amount_cents: -500 },
      },
      { fn: 'remove_invoice_item', args: { p_item: 'item-1' } },
    ]);
  });

  test('sendInvoice / voidInvoice / resendInvoiceEmail', async () => {
    await sendInvoice('inv-1');
    await voidInvoice('inv-1');
    await resendInvoiceEmail('inv-1');
    expect(mockRpcLog).toEqual([
      { fn: 'send_invoice', args: { p_invoice: 'inv-1' } },
      { fn: 'void_invoice', args: { p_invoice: 'inv-1' } },
      { fn: 'resend_invoice_email', args: { p_invoice: 'inv-1' } },
    ]);
  });

  test('uninvoicedVisitAmounts calls the definer RPC and returns its rows', async () => {
    mockRpcResult = { data: [{ visit_id: 'v1', amount_cents: 1234 }], error: null };
    const rows = await uninvoicedVisitAmounts('client-1');
    expect(mockRpcLog).toEqual([
      { fn: 'uninvoiced_visit_amounts', args: { p_client: 'client-1' } },
    ]);
    expect(rows).toEqual([{ visit_id: 'v1', amount_cents: 1234 }]);
  });

  test('uninvoicedVisitAmounts coerces a null result to an empty list', async () => {
    mockRpcResult = { data: null, error: null };
    await expect(uninvoicedVisitAmounts('client-1')).resolves.toEqual([]);
  });

  test('resendInvoiceEmail errors throw', async () => {
    mockRpcResult = { data: null, error: new Error('client has no email on file') };
    await expect(resendInvoiceEmail('inv-1')).rejects.toThrow('client has no email on file');
  });

  test('recordPayment defaults the memo to null and the tip to zero', async () => {
    mockRpcResult = { data: 'pay-1', error: null };
    await recordPayment('inv-1', 'venmo', 2500, '2026-08-25');
    expect(mockRpcLog).toEqual([
      {
        fn: 'record_payment',
        args: {
          p_invoice: 'inv-1',
          p_method: 'venmo',
          p_amount_cents: 2500,
          p_received_on: '2026-08-25',
          p_memo: null,
          p_tip_cents: 0,
        },
      },
    ]);
  });

  test('recordDeposit passes optional fields as null', async () => {
    mockRpcResult = { data: 'dep-1', error: null };
    await recordDeposit('client-1', 5000);
    await recordDeposit('client-1', 5000, { method: 'zelle', receivedOn: '2026-08-20', memo: 'hold' });
    expect(mockRpcLog).toEqual([
      {
        fn: 'record_deposit',
        args: {
          p_client: 'client-1',
          p_amount_cents: 5000,
          p_method: null,
          p_received_on: null,
          p_memo: null,
        },
      },
      {
        fn: 'record_deposit',
        args: {
          p_client: 'client-1',
          p_amount_cents: 5000,
          p_method: 'zelle',
          p_received_on: '2026-08-20',
          p_memo: 'hold',
        },
      },
    ]);
  });

  test('forfeitDeposit / refundDeposit', async () => {
    await forfeitDeposit('dep-1');
    await refundDeposit('dep-1');
    expect(mockRpcLog).toEqual([
      { fn: 'forfeit_deposit', args: { p_deposit: 'dep-1' } },
      { fn: 'refund_deposit', args: { p_deposit: 'dep-1' } },
    ]);
  });

  test('rpc errors throw', async () => {
    mockRpcResult = { data: null, error: new Error('nope') };
    await expect(sendInvoice('inv-1')).rejects.toThrow('nope');
  });
});

test('recordPayment passes the tip through (round 7)', async () => {
  mockRpcResult = { data: 'pay-2', error: null };
  await recordPayment('inv-1', 'venmo', 2500, '2026-08-25', null, 500);
  expect(mockRpcLog[0]!.args).toMatchObject({ p_amount_cents: 2500, p_tip_cents: 500 });
});
