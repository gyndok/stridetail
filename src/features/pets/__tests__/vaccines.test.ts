import {
  issueLabel,
  normalizeSpecies,
  parseRequiredVaccines,
  REQUIRABLE_TYPES,
  SPECIES_VACCINE_OPTIONS,
  vaccineIssues,
} from '../vaccines';

jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));

const NOW = new Date(2026, 8, 1); // 2026-09-01 local

test('normalizeSpecies lowercases, trims, and nulls blanks', () => {
  expect(normalizeSpecies(' Dog ')).toBe('dog');
  expect(normalizeSpecies('CAT')).toBe('cat');
  expect(normalizeSpecies('')).toBeNull();
  expect(normalizeSpecies('   ')).toBeNull();
  expect(normalizeSpecies(null)).toBeNull();
  expect(normalizeSpecies(undefined)).toBeNull();
});

test('parseRequiredVaccines keeps only valid doc types under normalized species keys', () => {
  expect(
    parseRequiredVaccines({ Dog: ['rabies', 'nonsense', 42], cat: ['fvrcp'], bird: [] }),
  ).toEqual({ dog: ['rabies'], cat: ['fvrcp'] });
  expect(parseRequiredVaccines(null)).toEqual({});
  expect(parseRequiredVaccines('rabies')).toEqual({});
  expect(parseRequiredVaccines(['rabies'])).toEqual({});
});

test('requirable types exclude the "other" grab-bag; species options cover dog and cat', () => {
  expect(REQUIRABLE_TYPES).not.toContain('other');
  expect(SPECIES_VACCINE_OPTIONS.map((o) => o.species)).toEqual(['dog', 'cat']);
});

test('vaccineIssues flags missing and fully-expired required types only', () => {
  const pets = [
    { id: 'p1', name: 'Olivia', species: 'dog' },
    { id: 'p2', name: 'Whiskey', species: 'cat' },
    { id: 'p3', name: 'Mystery', species: null },
  ];
  const required = { dog: ['rabies' as const, 'dhpp' as const], cat: ['rabies' as const] };
  const docs = [
    // p1 rabies expired, no dhpp at all
    { pet_id: 'p1', type: 'rabies' as const, expires_on: '2026-08-01' },
    // p2 rabies current
    { pet_id: 'p2', type: 'rabies' as const, expires_on: '2027-01-01' },
  ];
  expect(vaccineIssues(pets, docs, required, NOW)).toEqual([
    { petId: 'p1', petName: 'Olivia', type: 'rabies', status: 'expired' },
    { petId: 'p1', petName: 'Olivia', type: 'dhpp', status: 'missing' },
  ]);
});

test('a newer current record clears an older expired one; no-expiry docs count as on file', () => {
  const pets = [{ id: 'p1', name: 'Olivia', species: 'dog' }];
  const required = { dog: ['rabies' as const, 'lepto' as const] };
  const docs = [
    { pet_id: 'p1', type: 'rabies' as const, expires_on: '2026-01-01' }, // expired
    { pet_id: 'p1', type: 'rabies' as const, expires_on: '2027-06-01' }, // current
    { pet_id: 'p1', type: 'lepto' as const, expires_on: null }, // on file, no date
  ];
  expect(vaccineIssues(pets, docs, required, NOW)).toEqual([]);
});

test('pets with no species and species with no requirements produce no issues', () => {
  const pets = [
    { id: 'p1', name: 'Mystery', species: null },
    { id: 'p2', name: 'Iggy', species: 'iguana' },
  ];
  expect(vaccineIssues(pets, [], { dog: ['rabies'] }, NOW)).toEqual([]);
});

test('issueLabel reads naturally', () => {
  expect(issueLabel({ petId: 'p', petName: 'Callie', type: 'rabies', status: 'expired' })).toBe(
    'Rabies expired — Callie',
  );
  expect(issueLabel({ petId: 'p', petName: 'Callie', type: 'fvrcp', status: 'missing' })).toBe(
    'FVRCP (feline) missing — Callie',
  );
});
