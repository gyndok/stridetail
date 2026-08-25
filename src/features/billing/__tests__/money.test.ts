import {
  formatCents,
  formatIsoDate,
  invoiceBalance,
  invoiceNumberLabel,
  invoiceTotal,
  isOverdue,
  overdueCount,
  paymentsTotal,
  statusChip,
  sumCents,
  unpaidTotalCents,
} from '../money';

const cents = (values: number[]) => values.map((amount_cents) => ({ amount_cents }));

// Local noon keeps the device-local calendar day unambiguous in any test tz.
const NOW = new Date(2026, 7, 25, 12, 0, 0); // 2026-08-25 local

describe('sumCents / invoiceTotal / paymentsTotal', () => {
  test('empty lists sum to 0', () => {
    expect(sumCents([])).toBe(0);
    expect(invoiceTotal([])).toBe(0);
    expect(paymentsTotal([])).toBe(0);
  });

  test('invoiceTotal includes negative lines (deposit credits, discounts)', () => {
    expect(invoiceTotal(cents([2500, 500]))).toBe(3000);
    expect(invoiceTotal(cents([2500, -1000, -200]))).toBe(1300);
  });

  test('invoiceTotal may go negative (credit-heavy draft)', () => {
    expect(invoiceTotal(cents([500, -2000]))).toBe(-1500);
  });

  test('paymentsTotal sums payments', () => {
    expect(paymentsTotal(cents([1000, 500]))).toBe(1500);
  });
});

describe('invoiceBalance', () => {
  test('no payments -> full total', () => {
    expect(invoiceBalance(cents([2500, 500]), [])).toBe(3000);
  });

  test('partial payment leaves a positive balance', () => {
    expect(invoiceBalance(cents([3000]), cents([1000]))).toBe(2000);
  });

  test('exact payment zeroes the balance', () => {
    expect(invoiceBalance(cents([3000]), cents([1000, 2000]))).toBe(0);
  });

  test('over-payment is NOT floored — negative balance = credit', () => {
    expect(invoiceBalance(cents([1000]), cents([1500]))).toBe(-500);
  });

  test('negative items and payments combine', () => {
    // 2500 visit - 1000 deposit credit = 1500 total; 500 paid -> 1000 due.
    expect(invoiceBalance(cents([2500, -1000]), cents([500]))).toBe(1000);
  });
});

describe('isOverdue', () => {
  test('no due date is never overdue', () => {
    expect(isOverdue({ status: 'sent', due_on: null }, NOW)).toBe(false);
  });

  test('due yesterday and sent -> overdue', () => {
    expect(isOverdue({ status: 'sent', due_on: '2026-08-24' }, NOW)).toBe(true);
  });

  test('due today is not yet overdue', () => {
    expect(isOverdue({ status: 'sent', due_on: '2026-08-25' }, NOW)).toBe(false);
  });

  test('due tomorrow is not overdue', () => {
    expect(isOverdue({ status: 'sent', due_on: '2026-08-26' }, NOW)).toBe(false);
  });

  test('paid and void invoices are never overdue', () => {
    expect(isOverdue({ status: 'paid', due_on: '2026-01-01' }, NOW)).toBe(false);
    expect(isOverdue({ status: 'void', due_on: '2026-01-01' }, NOW)).toBe(false);
  });

  test('a draft past its due date counts as overdue', () => {
    expect(isOverdue({ status: 'draft', due_on: '2026-08-01' }, NOW)).toBe(true);
  });
});

describe('statusChip', () => {
  const totals = (itemsCents: number, paymentsCents: number) => ({ itemsCents, paymentsCents });

  test('paid is green, even past its due date', () => {
    expect(statusChip({ status: 'paid', due_on: '2026-01-01' }, totals(1000, 1000), NOW)).toEqual({
      label: 'Paid',
      tone: 'green',
    });
  });

  test('void is muted', () => {
    expect(statusChip({ status: 'void', due_on: null }, totals(1000, 0), NOW)).toEqual({
      label: 'Void',
      tone: 'muted',
    });
  });

  test('overdue is danger, and beats partially paid', () => {
    expect(statusChip({ status: 'sent', due_on: '2026-08-01' }, totals(1000, 500), NOW)).toEqual({
      label: 'Overdue',
      tone: 'danger',
    });
  });

  test('partially paid (0 < payments < total) is warning', () => {
    expect(statusChip({ status: 'sent', due_on: null }, totals(1000, 500), NOW)).toEqual({
      label: 'Partially paid',
      tone: 'warning',
    });
  });

  test('sent with no payments falls through to the status', () => {
    expect(statusChip({ status: 'sent', due_on: null }, totals(1000, 0), NOW)).toEqual({
      label: 'Sent',
      tone: 'neutral',
    });
  });

  test('draft is neutral', () => {
    expect(statusChip({ status: 'draft', due_on: null }, totals(0, 0), NOW)).toEqual({
      label: 'Draft',
      tone: 'neutral',
    });
  });

  test('over-paid but still sent shows the status, not partially paid', () => {
    expect(statusChip({ status: 'sent', due_on: null }, totals(1000, 1500), NOW)).toEqual({
      label: 'Sent',
      tone: 'neutral',
    });
  });
});

describe('summary helpers', () => {
  test('unpaidTotalCents sums balances of sent invoices only', () => {
    const rows = [
      { status: 'sent' as const, items: cents([1000]), payments: [] },
      { status: 'sent' as const, items: cents([2000]), payments: cents([500]) },
      { status: 'draft' as const, items: cents([999]), payments: [] },
      { status: 'paid' as const, items: cents([5000]), payments: cents([5000]) },
      { status: 'void' as const, items: cents([700]), payments: [] },
    ];
    expect(unpaidTotalCents(rows)).toBe(2500);
  });

  test('an over-paid sent invoice reduces the unpaid total (true balances)', () => {
    const rows = [
      { status: 'sent' as const, items: cents([1000]), payments: [] },
      { status: 'sent' as const, items: cents([1000]), payments: cents([1500]) },
    ];
    expect(unpaidTotalCents(rows)).toBe(500);
  });

  test('overdueCount counts overdue invoices across the list', () => {
    const rows = [
      { status: 'sent' as const, due_on: '2026-08-01' },
      { status: 'sent' as const, due_on: null },
      { status: 'paid' as const, due_on: '2026-08-01' },
      { status: 'draft' as const, due_on: '2026-08-24' },
    ];
    expect(overdueCount(rows, NOW)).toBe(2);
  });
});

describe('labels and formatting', () => {
  test('invoiceNumberLabel pads to four digits', () => {
    expect(invoiceNumberLabel(7)).toBe('INV-0007');
    expect(invoiceNumberLabel(42)).toBe('INV-0042');
    expect(invoiceNumberLabel(12345)).toBe('INV-12345');
  });

  test('formatCents renders dollars with sign outside the $', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(1300)).toBe('$13.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(-500)).toBe('-$5.00');
    expect(formatCents(-50)).toBe('-$0.50');
  });

  test('formatIsoDate renders a calendar date, malformed input unchanged', () => {
    expect(formatIsoDate('2026-08-25')).toBe('Aug 25, 2026');
    expect(formatIsoDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatIsoDate('nope')).toBe('nope');
  });
});
