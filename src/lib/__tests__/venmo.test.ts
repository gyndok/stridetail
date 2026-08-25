import { centsToAmountParam, venmoLink, withTip } from '../venmo';

describe('withTip', () => {
  it('adds the tip to the base amount', () => {
    expect(withTip(4500, 500)).toBe(5000);
  });

  it('treats a missing tip as zero', () => {
    expect(withTip(4500)).toBe(4500);
  });

  it('ignores zero, negative, and non-finite tips', () => {
    expect(withTip(4500, 0)).toBe(4500);
    expect(withTip(4500, -300)).toBe(4500);
    expect(withTip(4500, Number.NaN)).toBe(4500);
  });

  it('floors a fractional tip (cents are integers)', () => {
    expect(withTip(4500, 500.9)).toBe(5000);
  });
});

describe('centsToAmountParam', () => {
  it('renders dollars with exactly two decimals and no $', () => {
    expect(centsToAmountParam(5000)).toBe('50.00');
    expect(centsToAmountParam(4505)).toBe('45.05');
    expect(centsToAmountParam(50)).toBe('0.50');
  });
});

describe('venmoLink', () => {
  it('builds the https pay link with amount and encoded note', () => {
    expect(venmoLink({ handle: 'paw-whisker', amountCents: 4500, note: 'INV-0042' })).toBe(
      'https://venmo.com/paw-whisker?txn=pay&amount=45.00&note=INV-0042'
    );
  });

  it('folds the tip into the amount (4500 + 500 -> 50.00)', () => {
    expect(
      venmoLink({ handle: 'paw-whisker', amountCents: 4500, note: 'INV-0042', tipCents: 500 })
    ).toBe('https://venmo.com/paw-whisker?txn=pay&amount=50.00&note=INV-0042');
  });

  it('url-encodes the note', () => {
    expect(venmoLink({ handle: 'p', amountCents: 100, note: 'INV-0001 & tip' })).toBe(
      'https://venmo.com/p?txn=pay&amount=1.00&note=INV-0001%20%26%20tip'
    );
  });

  it('strips a leading @ and whitespace from the handle', () => {
    expect(venmoLink({ handle: ' @paw-whisker ', amountCents: 100, note: 'x' })).toBe(
      'https://venmo.com/paw-whisker?txn=pay&amount=1.00&note=x'
    );
  });
});
