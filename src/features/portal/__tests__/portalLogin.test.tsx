import { fireEvent, render, waitFor } from '@testing-library/react-native';

import PortalLogin from '@/app/(auth)/portal-login';
import SignIn from '@/app/(auth)/sign-in';
import { supabase } from '@/src/lib/supabase';
import { ThemeProvider } from '@/src/ui/theme';

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn(async () => ({ error: null })),
      verifyOtp: jest.fn(async () => ({ data: {}, error: null })),
      signInWithPassword: jest.fn(async () => ({ error: null })),
    },
    rpc: jest.fn(async () => ({ data: { linked: 0, links: [] }, error: null })),
  },
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Link: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Redirect: () => null,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const auth = supabase.auth as unknown as { signInWithOtp: jest.Mock; verifyOtp: jest.Mock };

beforeEach(() => jest.clearAllMocks());

test('portal login sends the code then verifies it with the typed email and code', async () => {
  const { getByLabelText, getByText } = await render(
    <ThemeProvider>
      <PortalLogin />
    </ThemeProvider>,
  );
  await fireEvent.changeText(getByLabelText('Email'), 'pet.parent@example.com');
  await fireEvent.press(getByText('Email me a code'));
  await waitFor(() =>
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'pet.parent@example.com',
      options: { shouldCreateUser: true },
    }),
  );
  // phase 2: the code entry replaces the email form
  await waitFor(() => getByLabelText('Sign-in code'));
  await fireEvent.changeText(getByLabelText('Sign-in code'), '92755878');
  await fireEvent.press(getByText('Sign in'));
  await waitFor(() =>
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: 'pet.parent@example.com',
      token: '92755878',
      type: 'email',
    }),
  );
});

test('staff sign-in links pet parents to the portal login', async () => {
  const { getByText } = await render(
    <ThemeProvider>
      <SignIn />
    </ThemeProvider>,
  );
  expect(getByText('Pet parent? Sign in here')).toBeTruthy();
});
