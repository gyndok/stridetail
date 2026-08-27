import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import { SettingsScreen } from '@/src/features/settings/SettingsScreen';
import { ThemeProvider } from '@/src/ui/theme';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/features/auth/session', () => ({
  signOut: jest.fn(async () => {}),
  useSession: () => ({ status: 'signed-in' }),
}));

jest.mock('@/src/features/business/active', () => ({
  useActiveBusiness: () => ({ businessId: 'b1', setBusinessId: jest.fn(async () => {}) }),
}));

const mockRole: { value: 'owner' | 'walker' } = { value: 'owner' };
jest.mock('@/src/features/business/useMemberships', () => ({
  useMemberships: () => ({
    data: [
      {
        id: 'm1',
        business_id: 'b1',
        role: mockRole.value,
        business: { id: 'b1', name: 'Paw & Whisker', time_zone: 'America/Chicago' },
      },
    ],
  }),
}));

jest.mock('@/src/features/settings/walkTheme', () => ({
  useWalkTheme: () => ({ walkTheme: 'warm', setWalkTheme: jest.fn(async () => {}) }),
}));

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("SettingsScreen — User's manual row", () => {
  beforeEach(() => mockPush.mockClear());

  test('owner routes to the owner-group manual', async () => {
    mockRole.value = 'owner';
    const r = await renderSettings();
    await fireEvent.press(r.getByText("User's manual"));
    expect(mockPush).toHaveBeenCalledWith('/(owner)/manual');
  });

  test('walker routes to the walker-group manual', async () => {
    mockRole.value = 'walker';
    const r = await renderSettings();
    await fireEvent.press(r.getByText("User's manual"));
    expect(mockPush).toHaveBeenCalledWith('/(walker)/manual');
  });

  test('the manual row renders above sign out', async () => {
    mockRole.value = 'owner';
    const r = await renderSettings();
    const json = JSON.stringify(r.toJSON());
    expect(json.indexOf("User's manual")).toBeGreaterThanOrEqual(0);
    expect(json.indexOf("User's manual")).toBeLessThan(json.indexOf('Sign out'));
  });
});
