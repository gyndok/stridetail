import { needsGeocode, parsePhones, phonesToText, telUrl, validateClient } from '../form';

// ---- parsePhones ----

test('parsePhones splits a comma-separated field into text[]', () => {
  expect(parsePhones('713-555-0101, 832-555-0202')).toEqual(['713-555-0101', '832-555-0202']);
});

test('parsePhones trims entries and drops empties', () => {
  expect(parsePhones(' 713-555-0101 ,, ,832-555-0202,')).toEqual([
    '713-555-0101',
    '832-555-0202',
  ]);
  expect(parsePhones('')).toEqual([]);
  expect(parsePhones('  ,  ,')).toEqual([]);
});

test('phonesToText joins for prefill and round-trips', () => {
  expect(phonesToText(['713-555-0101', '832-555-0202'])).toBe('713-555-0101, 832-555-0202');
  expect(phonesToText([])).toBe('');
  expect(phonesToText(null)).toBe('');
  expect(parsePhones(phonesToText(['a', 'b']))).toEqual(['a', 'b']);
});

// ---- validateClient ----

test('validateClient requires a non-blank name', () => {
  expect(validateClient({ name: '', email: '' })).toEqual({ name: 'Name is required' });
  expect(validateClient({ name: '   ', email: '' })).toEqual({ name: 'Name is required' });
  expect(validateClient({ name: 'Ann', email: '' })).toEqual({});
});

test('validateClient flags a malformed email but allows blank', () => {
  expect(validateClient({ name: 'Ann', email: 'not-an-email' })).toEqual({
    email: 'Enter a valid email',
  });
  expect(validateClient({ name: 'Ann', email: 'ann@example.com' })).toEqual({});
  expect(validateClient({ name: 'Ann', email: '   ' })).toEqual({});
});

test('validateClient reports both errors at once', () => {
  expect(validateClient({ name: '', email: 'nope' })).toEqual({
    name: 'Name is required',
    email: 'Enter a valid email',
  });
});

// ---- telUrl ----

test('telUrl strips non-digits for the tel: scheme', () => {
  expect(telUrl('(713) 555-0101')).toBe('tel:7135550101');
  expect(telUrl('713.555.0101 ext 2')).toBe('tel:71355501012');
});

test('telUrl keeps a leading + for international numbers', () => {
  expect(telUrl('+1 (713) 555-0101')).toBe('tel:+17135550101');
  expect(telUrl('1+2+3')).toBe('tel:123');
});

// ---- needsGeocode ----

test('needsGeocode is false when the address is blank', () => {
  expect(needsGeocode(null)).toBe(false);
  expect(needsGeocode(null, { address: '123 Main St', lat: 1 })).toBe(false);
});

test('needsGeocode is true for a new client with an address', () => {
  expect(needsGeocode('123 Main St')).toBe(true);
});

test('needsGeocode is true when the address changed', () => {
  expect(needsGeocode('456 Oak Ave', { address: '123 Main St', lat: 1 })).toBe(true);
});

test('needsGeocode is false when the address is unchanged and a pin exists', () => {
  expect(needsGeocode('123 Main St', { address: '123 Main St', lat: 1 })).toBe(false);
});

test('needsGeocode retries when the address is unchanged but there is no pin', () => {
  expect(needsGeocode('123 Main St', { address: '123 Main St', lat: null })).toBe(true);
});
