import type { ClientAccessCodes } from '@/src/features/clients/access';

import type { RevealedCodes } from '../accessCache';
import {
  buildEventInput,
  eventLabel,
  formatDistanceUS,
  formatElapsed,
  graceNote,
  revealFailureMode,
  revealFallback,
  tickerTime,
} from '../active';

// ---- formatElapsed: hh:mm:ss from a millisecond duration ----

test('formatElapsed renders hh:mm:ss with zero padding', () => {
  expect(formatElapsed(0)).toBe('00:00:00');
  expect(formatElapsed(332_000)).toBe('00:05:32');
  expect(formatElapsed((1 * 3600 + 2 * 60 + 3) * 1000)).toBe('01:02:03');
});

test('formatElapsed floors sub-second remainders and clamps negatives', () => {
  expect(formatElapsed(999)).toBe('00:00:00');
  expect(formatElapsed(-5_000)).toBe('00:00:00');
});

test('formatElapsed keeps counting past 24 hours (no wrap)', () => {
  expect(formatElapsed(25 * 3600 * 1000)).toBe('25:00:00');
});

// ---- formatDistanceUS: meters -> "420 ft" / "0.72 mi" ----

test('short distances render as feet rounded to the nearest 10', () => {
  expect(formatDistanceUS(0)).toBe('0 ft');
  expect(formatDistanceUS(30)).toBe('100 ft'); // 98.4 ft
  expect(formatDistanceUS(128)).toBe('420 ft'); // 419.9 ft
});

test('distances from a tenth of a mile render as miles with two decimals', () => {
  expect(formatDistanceUS(1158.7)).toBe('0.72 mi');
  expect(formatDistanceUS(1609.344)).toBe('1.00 mi');
  expect(formatDistanceUS(160.9344)).toBe('0.10 mi'); // exact boundary
  expect(formatDistanceUS(160.9)).toBe('530 ft'); // just under the boundary
});

// ---- buildEventInput: per-type payloads with per-pet attribution ----

const base = {
  visitId: 'v1',
  businessId: 'b1',
};

test('single-pet visits attribute every event to that pet automatically', () => {
  const input = buildEventInput({ ...base, type: 'pee', petIds: ['p1'] });
  expect(input).toEqual({ visitId: 'v1', businessId: 'b1', type: 'pee', petId: 'p1' });
});

test('multi-pet visits attribute the event to the selected chip', () => {
  const input = buildEventInput({
    ...base,
    type: 'poop',
    petIds: ['p1', 'p2'],
    selectedPetId: 'p2',
  });
  expect(input.petId).toBe('p2');
});

test('multi-pet with no selection and zero-pet visits carry no petId', () => {
  expect(
    buildEventInput({ ...base, type: 'ate', petIds: ['p1', 'p2'] }).petId,
  ).toBeUndefined();
  expect(buildEventInput({ ...base, type: 'drank', petIds: [] }).petId).toBeUndefined();
});

test('a selectedPetId not on the visit is ignored (stale chip after a refetch)', () => {
  const input = buildEventInput({
    ...base,
    type: 'meds',
    petIds: ['p1', 'p2'],
    selectedPetId: 'gone',
  });
  expect(input.petId).toBeUndefined();
});

test('note events carry the text, photo events the local uri', () => {
  expect(buildEventInput({ ...base, type: 'note', petIds: ['p1'], text: 'happy pup' })).toEqual({
    visitId: 'v1',
    businessId: 'b1',
    type: 'note',
    petId: 'p1',
    text: 'happy pup',
  });
  expect(
    buildEventInput({ ...base, type: 'photo', petIds: ['p1'], photoLocalUri: 'file:///a.jpg' })
      .photoLocalUri,
  ).toBe('file:///a.jpg');
});

test('absent optional fields are omitted, not set to undefined keys', () => {
  const input = buildEventInput({ ...base, type: 'pee', petIds: [] });
  expect('petId' in input).toBe(false);
  expect('text' in input).toBe(false);
  expect('photoLocalUri' in input).toBe(false);
});

// ---- event labels + ticker time ----

test('every field event type has a display label', () => {
  expect(eventLabel('pee')).toBe('Pee');
  expect(eventLabel('poop')).toBe('Poop');
  expect(eventLabel('photo')).toBe('Photo');
  expect(eventLabel('note')).toBe('Note');
  expect(eventLabel('ate')).toBe('Ate');
  expect(eventLabel('drank')).toBe('Drank');
  expect(eventLabel('meds')).toBe('Meds');
});

test('tickerTime renders the local wall clock HH:MM of an ISO instant', () => {
  // Built from LOCAL parts so the expectation holds in any test-runner tz.
  const local = new Date(2026, 7, 24, 9, 5, 42);
  expect(tickerTime(local.toISOString())).toBe('09:05');
});

// ---- reveal failure mode + grace fallback ----

test('reveal failures with no server status (network) fall back to the grace cache', () => {
  expect(revealFailureMode(undefined)).toBe('offline');
  expect(revealFailureMode(0)).toBe('offline');
});

test('reveal failures the server answered are denials, never grace fallbacks', () => {
  expect(revealFailureMode(400)).toBe('denied');
  expect(revealFailureMode(403)).toBe('denied');
  expect(revealFailureMode(500)).toBe('denied');
});

const codes: ClientAccessCodes = {
  door_code: '1234',
  lockbox_code: null,
  gate_code: null,
  alarm_code: null,
  key_location: null,
  notes: null,
};

test('revealFallback offers the cached codes with a retrieved-at note', () => {
  const revealedAt = new Date(2026, 7, 24, 8, 7).toISOString();
  const cached: RevealedCodes = { values: codes, revealedAt };
  expect(revealFallback(cached)).toEqual({
    kind: 'cached',
    codes,
    note: 'Retrieved 08:07 — codes may have changed since.',
  });
});

test('revealFallback with no cache says to call the owner', () => {
  expect(revealFallback(null)).toEqual({ kind: 'call-owner' });
});

test('graceNote pads the local wall clock', () => {
  expect(graceNote(new Date(2026, 0, 2, 9, 5).toISOString())).toBe(
    'Retrieved 09:05 — codes may have changed since.',
  );
  expect(graceNote(new Date(2026, 0, 2, 23, 59).toISOString())).toBe(
    'Retrieved 23:59 — codes may have changed since.',
  );
});
