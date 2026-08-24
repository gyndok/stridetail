import * as SecureStore from 'expo-secure-store';

import type { ClientAccessCodes } from '@/src/features/clients/access';

import { clearRevealedCodes, loadRevealedCodes, saveRevealedCodes } from '../accessCache';

const getItem = SecureStore.getItemAsync as jest.Mock;
const setItem = SecureStore.setItemAsync as jest.Mock;
const deleteItem = SecureStore.deleteItemAsync as jest.Mock;

const clientId = '44444444-4444-4444-4444-444444444444';
const key = `revealed-codes.${clientId}`;

const codes: ClientAccessCodes = {
  door_code: '1234',
  lockbox_code: null,
  gate_code: '9',
  alarm_code: null,
  key_location: 'under the frog statue',
  notes: null,
};

beforeEach(() => {
  getItem.mockReset().mockResolvedValue(null);
  setItem.mockReset().mockResolvedValue(undefined);
  deleteItem.mockReset().mockResolvedValue(undefined);
});

test('save stores the values with the reveal instant under the client key', async () => {
  const now = () => new Date('2026-08-24T12:00:00.000Z');
  await saveRevealedCodes(clientId, codes, now);
  expect(setItem).toHaveBeenCalledTimes(1);
  const [k, v] = setItem.mock.calls[0]!;
  expect(k).toBe(key);
  expect(JSON.parse(v as string)).toEqual({ values: codes, revealedAt: '2026-08-24T12:00:00.000Z' });
});

test('load inside the grace window returns the values and the reveal timestamp', async () => {
  getItem.mockResolvedValue(JSON.stringify({ values: codes, revealedAt: '2026-08-24T12:00:00.000Z' }));
  const now = () => new Date('2026-08-24T15:59:00.000Z'); // 3h59m later
  const result = await loadRevealedCodes(clientId, 4, now);
  expect(result).toEqual({ values: codes, revealedAt: '2026-08-24T12:00:00.000Z' });
  expect(deleteItem).not.toHaveBeenCalled();
});

test('load past expiry returns null and deletes the entry', async () => {
  getItem.mockResolvedValue(JSON.stringify({ values: codes, revealedAt: '2026-08-24T12:00:00.000Z' }));
  const now = () => new Date('2026-08-24T16:00:01.000Z'); // 4h + 1s later
  expect(await loadRevealedCodes(clientId, 4, now)).toBeNull();
  expect(deleteItem).toHaveBeenCalledWith(key);
});

test('load with nothing cached returns null without deleting', async () => {
  expect(await loadRevealedCodes(clientId, 4)).toBeNull();
  expect(deleteItem).not.toHaveBeenCalled();
});

test('corrupted JSON is deleted and treated as absent', async () => {
  getItem.mockResolvedValue('{not json');
  expect(await loadRevealedCodes(clientId, 4)).toBeNull();
  expect(deleteItem).toHaveBeenCalledWith(key);
});

test('an entry with a bad shape or unparsable timestamp is deleted', async () => {
  getItem.mockResolvedValue(JSON.stringify({ values: codes })); // no revealedAt
  expect(await loadRevealedCodes(clientId, 4)).toBeNull();
  getItem.mockResolvedValue(JSON.stringify({ values: codes, revealedAt: 'not-a-date' }));
  expect(await loadRevealedCodes(clientId, 4)).toBeNull();
  expect(deleteItem).toHaveBeenCalledTimes(2);
});

test('clear deletes the entry', async () => {
  await clearRevealedCodes(clientId);
  expect(deleteItem).toHaveBeenCalledWith(key);
});
