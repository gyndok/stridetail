import { Platform } from 'react-native';

import { geocodeAddress } from '../geocode';

jest.mock('expo-location', () => ({
  geocodeAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Location = require('expo-location') as {
  geocodeAsync: jest.Mock;
  getForegroundPermissionsAsync: jest.Mock;
  requestForegroundPermissionsAsync: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
});

test('returns lat/lng from the first geocode result', async () => {
  Location.geocodeAsync.mockResolvedValue([
    { latitude: 29.76, longitude: -95.37 },
    { latitude: 1, longitude: 2 },
  ]);
  await expect(geocodeAddress('123 Main St, Houston TX')).resolves.toEqual({
    lat: 29.76,
    lng: -95.37,
  });
  expect(Location.geocodeAsync).toHaveBeenCalledWith('123 Main St, Houston TX');
});

test('trims the address before geocoding', async () => {
  Location.geocodeAsync.mockResolvedValue([{ latitude: 1, longitude: 2 }]);
  await geocodeAddress('  123 Main St  ');
  expect(Location.geocodeAsync).toHaveBeenCalledWith('123 Main St');
});

test('skips geocoding entirely for blank / null / undefined addresses', async () => {
  await expect(geocodeAddress('')).resolves.toBeNull();
  await expect(geocodeAddress('   ')).resolves.toBeNull();
  await expect(geocodeAddress(null)).resolves.toBeNull();
  await expect(geocodeAddress(undefined)).resolves.toBeNull();
  expect(Location.geocodeAsync).not.toHaveBeenCalled();
});

test('returns null on an empty result set', async () => {
  Location.geocodeAsync.mockResolvedValue([]);
  await expect(geocodeAddress('nowhere')).resolves.toBeNull();
});

test('never throws: geocodeAsync rejection resolves to null', async () => {
  Location.geocodeAsync.mockRejectedValue(new Error('rate limited'));
  await expect(geocodeAddress('123 Main St')).resolves.toBeNull();
});

test('ios does not touch location permissions (none required per v57 docs)', async () => {
  Location.geocodeAsync.mockResolvedValue([{ latitude: 1, longitude: 2 }]);
  await geocodeAddress('123 Main St');
  expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

describe('android (foreground permission required per v57 docs)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  test('geocodes without prompting when permission already granted', async () => {
    Location.geocodeAsync.mockResolvedValue([{ latitude: 1, longitude: 2 }]);
    await expect(geocodeAddress('123 Main St')).resolves.toEqual({ lat: 1, lng: 2 });
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  test('requests permission once when not yet granted', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    Location.geocodeAsync.mockResolvedValue([{ latitude: 1, longitude: 2 }]);
    await expect(geocodeAddress('123 Main St')).resolves.toEqual({ lat: 1, lng: 2 });
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  test('returns null (no throw, no geocode) when permission is denied', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(geocodeAddress('123 Main St')).resolves.toBeNull();
    expect(Location.geocodeAsync).not.toHaveBeenCalled();
  });
});
