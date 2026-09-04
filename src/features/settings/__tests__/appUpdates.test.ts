import { updateLine, type UpdateInfo } from '../appUpdates';

jest.mock('expo-updates', () => ({ isEnabled: false, isEmbeddedLaunch: true }));

const info = (over: Partial<UpdateInfo>): UpdateInfo => ({
  kind: 'downloaded',
  shortId: '01a06e6c',
  publishedAt: new Date(2026, 8, 4, 17, 12),
  runtimeVersion: '0.2.2',
  ...over,
});

test('updateLine shows the downloaded bundle id and publish time', () => {
  const line = updateLine(info({}), '0.2.2');
  expect(line).toContain('Update 01a06e6c');
  expect(line).toMatch(/Sep 4/);
});

test('updateLine labels the embedded bundle with the binary version', () => {
  expect(updateLine(info({ kind: 'embedded', shortId: null, publishedAt: null }), '0.2.2')).toBe(
    'Built-in bundle (app 0.2.2)',
  );
});

test('updateLine on web/unavailable falls back to the app version', () => {
  expect(
    updateLine(info({ kind: 'unavailable', shortId: null, publishedAt: null, runtimeVersion: null }), '0.2.2'),
  ).toBe('App 0.2.2');
});
