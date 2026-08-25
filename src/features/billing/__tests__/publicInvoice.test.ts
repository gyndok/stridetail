import { INVOICE_BASE_URL } from '@/src/lib/brand';

import {
  invoiceEndpoint,
  invoiceViewModel,
  type InvoicePayload,
} from '../publicInvoice';

const payload: InvoicePayload = {
  business: { name: 'Paw & Whisker', brandColor: '#336699', logoUrl: null },
  businessTz: 'America/Chicago',
  clientFirstName: 'Marisol',
  invoice: {
    numberLabel: 'INV-0007',
    issuedOn: '2026-08-25',
    dueOn: '2026-09-01',
    status: 'sent',
    paidAt: null,
  },
  items: [
    { description: 'Mon, Aug 24 — Walk', amountCents: 3000, kind: 'visit' },
    { description: 'Tue, Aug 25 — Walk', amountCents: 3000, kind: 'visit' },
    { description: 'Deposit applied', amountCents: -2500, kind: 'deposit_credit' },
  ],
  paymentsTotalCents: 1000,
  balanceCents: 2500,
  paymentInstructionsMd: 'Venmo @pawwhisker',
};

describe('invoiceViewModel', () => {
  it('renders the sent invoice: title, dates, items, totals, balance', () => {
    const vm = invoiceViewModel(payload);
    expect(vm.title).toBe('Invoice INV-0007');
    expect(vm.clientLine).toBe('Prepared for Marisol');
    expect(vm.issuedLine).toBe('Issued Aug 25, 2026');
    expect(vm.dueLine).toBe('Due Sep 1, 2026');
    expect(vm.paid).toBe(false);
    expect(vm.paidLine).toBeNull();
    expect(vm.items).toEqual([
      { description: 'Mon, Aug 24 — Walk', amountText: '$30.00', isCredit: false },
      { description: 'Tue, Aug 25 — Walk', amountText: '$30.00', isCredit: false },
      { description: 'Deposit applied', amountText: '-$25.00', isCredit: true },
    ]);
    expect(vm.totalText).toBe('$35.00'); // 30 + 30 - 25
    expect(vm.paymentsText).toBe('-$10.00');
    expect(vm.balanceText).toBe('$25.00');
  });

  it('renders the paid stamp with paidAt in the BUSINESS tz', () => {
    const vm = invoiceViewModel({
      ...payload,
      invoice: {
        ...payload.invoice,
        status: 'paid',
        // 03:00 UTC Aug 31 is still Aug 30 in Chicago — the tz must matter.
        paidAt: '2026-08-31T03:00:00Z',
      },
      paymentsTotalCents: 3500,
      balanceCents: 0,
    });
    expect(vm.paid).toBe(true);
    expect(vm.paidLine).toBe('Paid Aug 30, 2026');
    expect(vm.balanceText).toBe('$0.00');
  });

  it('paid without a paidAt instant still stamps, without a date line', () => {
    const vm = invoiceViewModel({
      ...payload,
      invoice: { ...payload.invoice, status: 'paid', paidAt: null },
    });
    expect(vm.paid).toBe(true);
    expect(vm.paidLine).toBeNull();
  });

  it('hides the optional lines when the payload lacks them', () => {
    const vm = invoiceViewModel({
      ...payload,
      clientFirstName: '',
      invoice: { ...payload.invoice, dueOn: null },
      paymentsTotalCents: 0,
      balanceCents: 3500,
    });
    expect(vm.clientLine).toBeNull();
    expect(vm.dueLine).toBeNull();
    expect(vm.paymentsText).toBeNull();
  });

  it('over-payment shows a negative (credit) balance, never a floored $0.00', () => {
    const vm = invoiceViewModel({ ...payload, paymentsTotalCents: 4000, balanceCents: -500 });
    expect(vm.balanceText).toBe('-$5.00');
  });
});

describe('endpoints and links', () => {
  it('invoiceEndpoint builds the functions/v1 path without doubled slashes', () => {
    expect(invoiceEndpoint('http://localhost:54321/')).toBe(
      'http://localhost:54321/functions/v1/invoice-public',
    );
  });

  it('INVOICE_BASE_URL mirrors send-email DEFAULT_INVOICE_BASE (change both together)', () => {
    // The function env default lives in supabase/functions/send-email/index.ts;
    // this pin is the REPORT_BASE_URL precedent: the link the owner shares must
    // be byte-identical to the one the client received by email.
    expect(INVOICE_BASE_URL).toBe('https://stridetail.app/invoice');
  });
});
