import { pushSupportedFor } from '../push';

jest.mock('expo-updates', () => ({ runtimeVersion: null }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { extra: { eas: { projectId: 'x' } } } } }));
jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));

test('push is gated to binaries bundling expo-notifications (>= 0.2.2)', () => {
  expect(pushSupportedFor('0.2.1')).toBe(false); // shipped without the module
  expect(pushSupportedFor('0.2.2')).toBe(true);
  expect(pushSupportedFor('0.3.0')).toBe(true);
  expect(pushSupportedFor('1.0.0')).toBe(true);
});

test('dev client may test; unknown runtimes fail closed', () => {
  expect(pushSupportedFor(null)).toBe(true);
  expect(pushSupportedFor('custom')).toBe(false);
});
