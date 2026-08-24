import { hydrateWalkTheme, parseWalkTheme, useWalkThemeStore } from '../walkTheme';

function memKV(initial: [string, string][] = []) {
  const mem = new Map<string, string>(initial);
  return {
    mem,
    storage: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: async (k: string) => {
        mem.delete(k);
      },
    },
  };
}

beforeEach(() => {
  useWalkThemeStore.setState({ walkTheme: 'warm', hydrated: false });
});

test('walk theme defaults to warm and persists through the injected storage', async () => {
  const { mem, storage } = memKV();
  await hydrateWalkTheme(storage);
  expect(useWalkThemeStore.getState().walkTheme).toBe('warm');
  expect(useWalkThemeStore.getState().hydrated).toBe(true);

  await useWalkThemeStore.getState().setWalkTheme('dark', storage);
  expect(mem.get('walkTheme')).toBe('dark');

  useWalkThemeStore.setState({ walkTheme: 'warm', hydrated: false });
  await hydrateWalkTheme(storage);
  expect(useWalkThemeStore.getState().walkTheme).toBe('dark');
});

test('switching back to warm round-trips too', async () => {
  const { mem, storage } = memKV([['walkTheme', 'dark']]);
  await hydrateWalkTheme(storage);
  expect(useWalkThemeStore.getState().walkTheme).toBe('dark');

  await useWalkThemeStore.getState().setWalkTheme('warm', storage);
  expect(mem.get('walkTheme')).toBe('warm');

  useWalkThemeStore.setState({ walkTheme: 'dark', hydrated: false });
  await hydrateWalkTheme(storage);
  expect(useWalkThemeStore.getState().walkTheme).toBe('warm');
});

test('an unknown persisted value falls back to warm', () => {
  expect(parseWalkTheme(null)).toBe('warm');
  expect(parseWalkTheme('')).toBe('warm');
  expect(parseWalkTheme('midnight')).toBe('warm');
  expect(parseWalkTheme('dark')).toBe('dark');
  expect(parseWalkTheme('warm')).toBe('warm');
});
