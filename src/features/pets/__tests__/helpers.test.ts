import { birthdateFromAgeInput, petAge, storagePetPhotoPath, validatePet } from '../helpers';

// ---- petAge (pure date-only math; `now` injected, no time zone involved) ----

test('petAge reports whole years once at least one year old', () => {
  expect(petAge('2023-03-10', new Date(2026, 7, 23))).toBe('3 y');
  expect(petAge('2025-08-23', new Date(2026, 7, 23))).toBe('1 y');
});

test('petAge reports months under one year', () => {
  expect(petAge('2025-12-20', new Date(2026, 7, 23))).toBe('8 mo');
  expect(petAge('2026-08-01', new Date(2026, 7, 23))).toBe('0 mo');
});

test('petAge counts a month/year boundary by day of month', () => {
  // birthday not yet reached this year → still 2 y
  expect(petAge('2023-08-24', new Date(2026, 7, 23))).toBe('2 y');
  // birthday today → 3 y
  expect(petAge('2023-08-23', new Date(2026, 7, 23))).toBe('3 y');
  // month not yet completed → previous month count
  expect(petAge('2026-01-24', new Date(2026, 7, 23))).toBe('6 mo');
});

test('petAge returns null for missing, malformed, or future birthdates', () => {
  expect(petAge(null, new Date(2026, 7, 23))).toBeNull();
  expect(petAge('', new Date(2026, 7, 23))).toBeNull();
  expect(petAge('23/08/2020', new Date(2026, 7, 23))).toBeNull();
  expect(petAge('2020-13-40', new Date(2026, 7, 23))).toBeNull();
  expect(petAge('2027-01-01', new Date(2026, 7, 23))).toBeNull();
});

// ---- storagePetPhotoPath ----

test('storagePetPhotoPath follows the media bucket convention (first segment = business id)', () => {
  expect(storagePetPhotoPath('11111111-1111-1111-1111-111111111111', 'aaaa')).toBe(
    '11111111-1111-1111-1111-111111111111/pets/aaaa/photo.jpg',
  );
});

// ---- validatePet ----

test('validatePet requires name and species', () => {
  expect(validatePet({ name: '', species: 'Dog', age: '' })).toEqual({
    name: 'Name is required',
  });
  expect(validatePet({ name: 'Rex', species: '  ', age: '' })).toEqual({
    species: 'Species is required',
  });
  expect(validatePet({ name: ' ', species: '', age: '' })).toEqual({
    name: 'Name is required',
    species: 'Species is required',
  });
});

test('validatePet accepts blank/parsable ages and rejects gibberish', () => {
  expect(validatePet({ name: 'Rex', species: 'Dog', age: '' })).toEqual({});
  expect(validatePet({ name: 'Rex', species: 'Dog', age: '3' })).toEqual({});
  expect(validatePet({ name: 'Rex', species: 'Dog', age: '8 mo' })).toEqual({});
  expect(validatePet({ name: 'Rex', species: 'Dog', age: '2023-03-10' })).toEqual({});
  expect(validatePet({ name: 'Rex', species: 'Dog', age: 'puppyish' }).age).toMatch(/age like/);
  expect(validatePet({ name: 'Rex', species: 'Dog', age: '2023-02-30' }).age).toMatch(/age like/);
});

// ---- birthdateFromAgeInput (round 3: age-first entry) ----

const NOW = new Date(2026, 8, 2); // 2026-09-02 local

test('birthdateFromAgeInput: years, decimals, and unit suffixes', () => {
  expect(birthdateFromAgeInput('3', NOW)).toBe('2023-09-02');
  expect(birthdateFromAgeInput('3 y', NOW)).toBe('2023-09-02');
  expect(birthdateFromAgeInput('2 years', NOW)).toBe('2024-09-02');
  expect(birthdateFromAgeInput('0.5', NOW)).toBe('2026-03-02');
});

test('birthdateFromAgeInput: months', () => {
  expect(birthdateFromAgeInput('8 mo', NOW)).toBe('2026-01-02');
  expect(birthdateFromAgeInput('10 months', NOW)).toBe('2025-11-02');
});

test('birthdateFromAgeInput: day clamps into short target months', () => {
  const endOfMonth = new Date(2026, 6, 31); // 2026-07-31
  expect(birthdateFromAgeInput('1 mo', endOfMonth)).toBe('2026-06-30');
});

test('birthdateFromAgeInput: exact dates pass through; future/invalid rejected', () => {
  expect(birthdateFromAgeInput('2023-03-10', NOW)).toBe('2023-03-10');
  expect(birthdateFromAgeInput('2030-01-01', NOW)).toBeNull();
  expect(birthdateFromAgeInput('2023-02-30', NOW)).toBeNull();
  expect(birthdateFromAgeInput('soon', NOW)).toBeNull();
});
