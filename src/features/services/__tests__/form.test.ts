import {
  centsToDollarsString,
  dollarsStringToCents,
  parseDurationMin,
  validateService,
} from '../form';

// ---- centsToDollarsString ----

test('centsToDollarsString renders cents as a two-decimal dollar string', () => {
  expect(centsToDollarsString(2500)).toBe('25.00');
  expect(centsToDollarsString(2050)).toBe('20.50');
  expect(centsToDollarsString(5)).toBe('0.05');
  expect(centsToDollarsString(0)).toBe('0.00');
});

test('centsToDollarsString round-trips through dollarsStringToCents', () => {
  for (const cents of [0, 5, 99, 100, 2500, 8501]) {
    expect(dollarsStringToCents(centsToDollarsString(cents))).toBe(cents);
  }
});

// ---- dollarsStringToCents ----

test('dollarsStringToCents accepts whole dollars, one and two decimals', () => {
  expect(dollarsStringToCents('12')).toBe(1200);
  expect(dollarsStringToCents('12.5')).toBe(1250);
  expect(dollarsStringToCents('12.50')).toBe(1250);
  expect(dollarsStringToCents('0')).toBe(0);
  expect(dollarsStringToCents('0.05')).toBe(5);
});

test('dollarsStringToCents tolerates whitespace and a leading $', () => {
  expect(dollarsStringToCents(' 12.50 ')).toBe(1250);
  expect(dollarsStringToCents('$12.50')).toBe(1250);
  expect(dollarsStringToCents('$ 12')).toBe(1200);
});

test('dollarsStringToCents rejects junk, negatives, and too many decimals', () => {
  expect(dollarsStringToCents('')).toBeNull();
  expect(dollarsStringToCents('   ')).toBeNull();
  expect(dollarsStringToCents('abc')).toBeNull();
  expect(dollarsStringToCents('-5')).toBeNull();
  expect(dollarsStringToCents('12.345')).toBeNull();
  expect(dollarsStringToCents('12.')).toBeNull();
  expect(dollarsStringToCents('.50')).toBeNull();
  expect(dollarsStringToCents('12,50')).toBeNull();
  expect(dollarsStringToCents('1e2')).toBeNull();
});

// ---- parseDurationMin ----

test('parseDurationMin accepts positive integers only', () => {
  expect(parseDurationMin('30')).toBe(30);
  expect(parseDurationMin(' 45 ')).toBe(45);
  expect(parseDurationMin('0')).toBeNull();
  expect(parseDurationMin('-30')).toBeNull();
  expect(parseDurationMin('30.5')).toBeNull();
  expect(parseDurationMin('abc')).toBeNull();
  expect(parseDurationMin('')).toBeNull();
});

// ---- validateService ----

const valid = {
  name: 'Walk',
  kind: 'walk' as const,
  durationMin: '30',
  basePrice: '25.00',
  extraPetPrice: '5',
};

test('validateService passes a complete form', () => {
  expect(validateService(valid)).toEqual({});
});

test('validateService requires a non-blank name', () => {
  expect(validateService({ ...valid, name: '' })).toEqual({ name: 'Name is required' });
  expect(validateService({ ...valid, name: '   ' })).toEqual({ name: 'Name is required' });
});

test('validateService requires a kind', () => {
  expect(validateService({ ...valid, kind: null })).toEqual({ kind: 'Pick a kind' });
});

test('validateService requires duration greater than zero', () => {
  expect(validateService({ ...valid, durationMin: '0' })).toEqual({
    durationMin: 'Enter minutes greater than 0',
  });
  expect(validateService({ ...valid, durationMin: 'x' })).toEqual({
    durationMin: 'Enter minutes greater than 0',
  });
});

test('validateService validates both price fields', () => {
  expect(validateService({ ...valid, basePrice: 'nope' })).toEqual({
    basePrice: 'Enter a price like 12.50',
  });
  expect(validateService({ ...valid, extraPetPrice: '-1' })).toEqual({
    extraPetPrice: 'Enter a price like 12.50',
  });
});

test('validateService reports all errors at once', () => {
  expect(validateService({ name: '', kind: null, durationMin: '', basePrice: 'x', extraPetPrice: 'y' })).toEqual({
    name: 'Name is required',
    kind: 'Pick a kind',
    durationMin: 'Enter minutes greater than 0',
    basePrice: 'Enter a price like 12.50',
    extraPetPrice: 'Enter a price like 12.50',
  });
});
