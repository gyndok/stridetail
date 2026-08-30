import '@testing-library/react-native';

// react-native-svg is a native module and ships NO jest mock entry point in
// 15.15.4 (no `react-native-svg/jest-mock`; checked the package). Standard
// community fallback: stub the primitives as pass-through Views so icon tests
// can render without native code and assert svg props (stroke/fill) directly.
jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const stub = (name: string) => {
    const C = (props: object) => React.createElement(View, props);
    C.displayName = name;
    return C;
  };
  return {
    __esModule: true,
    default: stub('Svg'),
    Svg: stub('Svg'),
    Path: stub('Path'),
    Circle: stub('Circle'),
    Rect: stub('Rect'),
  };
});

jest.mock('expo-crypto', () => ({ randomUUID: () => Math.random().toString(36).slice(2) }));
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: jest.fn(),
    runAsync: jest.fn(),
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => null),
  }),
}));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
}));
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon';
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

