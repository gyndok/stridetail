import { petAge, storagePetPhotoPath, validatePet } from '../helpers';

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
  expect(validatePet({ name: '', species: 'Dog', birthdate: '' })).toEqual({
    name: 'Name is required',
  });
  expect(validatePet({ name: 'Rex', species: '  ', birthdate: '' })).toEqual({
    species: 'Species is required',
  });
  expect(validatePet({ name: ' ', species: '', birthdate: '' })).toEqual({
    name: 'Name is required',
    species: 'Species is required',
  });
});

test('validatePet accepts a blank birthdate and rejects malformed ones', () => {
  expect(validatePet({ name: 'Rex', species: 'Dog', birthdate: '' })).toEqual({});
  expect(validatePet({ name: 'Rex', species: 'Dog', birthdate: '2023-03-10' })).toEqual({});
  expect(validatePet({ name: 'Rex', species: 'Dog', birthdate: '03/10/2023' })).toEqual({
    birthdate: 'Use YYYY-MM-DD',
  });
  expect(validatePet({ name: 'Rex', species: 'Dog', birthdate: '2023-02-30' })).toEqual({
    birthdate: 'Use YYYY-MM-DD',
  });
});
