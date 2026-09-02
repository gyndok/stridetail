import { videoCaptureSupportedFor } from '../videoSupport';

jest.mock('expo-updates', () => ({ runtimeVersion: null }));

test('video capture is gated to binaries with the mic permission (>= 0.2.1)', () => {
  expect(videoCaptureSupportedFor('0.2.0')).toBe(false); // shipped without mic plist key
  expect(videoCaptureSupportedFor('0.2.1')).toBe(true);
  expect(videoCaptureSupportedFor('0.3.0')).toBe(true);
  expect(videoCaptureSupportedFor('1.0.0')).toBe(true);
  expect(videoCaptureSupportedFor('0.1.9')).toBe(false);
});

test('dev client (no runtime version) may test; unknown formats fail closed', () => {
  expect(videoCaptureSupportedFor(null)).toBe(true);
  expect(videoCaptureSupportedFor(undefined)).toBe(true);
  expect(videoCaptureSupportedFor('custom-runtime')).toBe(false);
});
