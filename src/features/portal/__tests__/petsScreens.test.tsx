import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import PortalPetEditor from '@/app/(portal)/pet/[id]';
import PortalPets from '@/app/(portal)/pets';
import { ThemeProvider } from '@/src/ui/theme';

import type { PortalPetDetail } from '../petsApi';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args) },
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useLocalSearchParams: () => ({ id: 'p1' }),
    // Focus == mounted in tests: the cleanup (the wipe) runs on unmount.
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(() => cb(), [cb]),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const mockLink = { id: 'cu1', business_id: 'b1', client_id: 'c1' };
const mockBiz = { id: 'b1', name: 'Paw & Whisker', brand_color: '#336699', time_zone: 'America/Chicago' };

jest.mock('@/src/features/portal/hooks', () => ({
  usePortalScope: () => ({
    link: mockLink,
    links: [mockLink],
    business: mockBiz,
    businesses: [mockBiz],
    setLinkId: jest.fn(async () => {}),
  }),
}));

const petDetail: PortalPetDetail = {
  id: 'p1',
  client_id: 'c1',
  business_id: 'b1',
  name: 'Biscuit',
  species: 'Dog',
  breed: 'Corgi',
  birthdate: '2022-04-01',
  feeding_md: '1 cup kibble',
  meds_md: 'Apoquel 16mg daily',
  allergies: 'Chicken',
  reactivity_md: null,
  vet_name: null,
  vet_phone: null,
  vet_address: null,
  photo_path: null,
};

const mockState: { pets: PortalPetDetail[] } = { pets: [] };

jest.mock('@/src/features/portal/petsHooks', () => ({
  usePortalPetCards: () => ({ isSuccess: true, data: mockState.pets }),
  usePortalPet: () => ({ isSuccess: mockState.pets.length > 0, data: mockState.pets[0] ?? null }),
  usePortalPetPhoto: () => ({ data: null }),
}));

const mockUpdatePet = jest.fn(async (..._args: unknown[]): Promise<PortalPetDetail> => petDetail);
jest.mock('@/src/features/portal/petsApi', () => ({
  updatePortalPet: (...args: unknown[]) => mockUpdatePet(...args),
  uploadPortalPetPhoto: jest.fn(async () => petDetail),
}));

const mockHasCodes = jest.fn(async (..._args: unknown[]) => false);
const mockReveal = jest.fn(
  async (..._args: unknown[]): Promise<Record<string, string | null>> => ({
    door_code: '4321',
    lockbox_code: null,
    gate_code: null,
    alarm_code: null,
    key_location: 'under the mat',
    notes: null,
  }),
);
const mockSetCodes = jest.fn(async (..._args: unknown[]) => {});
jest.mock('@/src/features/portal/accessApi', () => ({
  hasClientAccessSelf: (...args: unknown[]) => mockHasCodes(...args),
  revealClientAccessSelf: (...args: unknown[]) => mockReveal(...args),
  setClientAccessSelf: (...args: unknown[]) => mockSetCodes(...args),
}));

function renderInPortal(el: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>{el}</ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.pets = [];
});

test('pets tab: cards with name and readable species/breed, routing to the editor', async () => {
  mockState.pets = [petDetail];
  const { getByText, getByLabelText } = await renderInPortal(<PortalPets />);
  expect(getByText('Biscuit')).toBeTruthy();
  expect(getByText('Dog · Corgi')).toBeTruthy();
  await fireEvent.press(getByLabelText('Edit Biscuit'));
  expect(mockPush).toHaveBeenCalledWith('/(portal)/pet/p1');
});

test('pets tab: empty state and the access-codes card', async () => {
  const { getByText, findByText } = await renderInPortal(<PortalPets />);
  expect(
    getByText('No pets on file yet — your pet care provider adds pets to your account.'),
  ).toBeTruthy();
  expect(getByText('Access codes')).toBeTruthy();
  expect(await findByText('No codes on file yet')).toBeTruthy();
  expect(mockHasCodes).toHaveBeenCalledWith('c1');
});

test('access codes: reveal on tap is per-mount and wiped on unmount', async () => {
  mockHasCodes.mockResolvedValue(true);
  const first = await renderInPortal(<PortalPets />);
  await fireEvent.press(await first.findByText('Reveal codes'));
  expect(mockReveal).toHaveBeenCalledWith('c1');
  expect(await first.findByText('4321')).toBeTruthy();
  expect(first.getByText('under the mat')).toBeTruthy();
  // Blur/unmount wipes the component state — a fresh mount holds no plaintext
  // until the (audited) reveal runs again.
  await first.unmount();
  const second = await renderInPortal(<PortalPets />);
  expect(second.queryByText('4321')).toBeNull();
  expect(await second.findByText('Reveal codes')).toBeTruthy();
});

test('access codes: save sends the form through the self RPC wrapper', async () => {
  mockHasCodes.mockResolvedValue(false);
  const { findByText, getByLabelText, getByText } = await renderInPortal(<PortalPets />);
  await fireEvent.press(await findByText('Add codes'));
  await waitFor(() => expect(getByText('Edit access codes')).toBeTruthy());
  await fireEvent.changeText(getByLabelText('Door code'), '7777');
  await fireEvent.press(getByText('Save codes'));
  await waitFor(() =>
    expect(mockSetCodes).toHaveBeenCalledWith('c1', {
      door: '7777',
      lockbox: '',
      gate: '',
      alarm: '',
      keyLocation: '',
      notes: '',
    }),
  );
});

test('editor: read-only meds/allergies, save carries only the self-service columns', async () => {
  mockState.pets = [petDetail];
  const { getByText, getByLabelText } = await renderInPortal(<PortalPetEditor />);
  // owner-curated fields render read-only
  expect(getByText('Apoquel 16mg daily')).toBeTruthy();
  expect(getByText('Chicken')).toBeTruthy();
  // no editable field exists for them
  expect(() => getByLabelText('Medications')).toThrow();
  await fireEvent.changeText(getByLabelText('Feeding notes'), '2 cups kibble');
  await fireEvent.changeText(getByLabelText('Vet name'), 'Dr. Lin');
  await fireEvent.press(getByText('Save changes'));
  await waitFor(() =>
    expect(mockUpdatePet).toHaveBeenCalledWith('c1', 'p1', {
      feeding_md: '2 cups kibble',
      reactivity_md: null,
      vet_name: 'Dr. Lin',
      vet_phone: null,
      vet_address: null,
    }),
  );
  const payload = mockUpdatePet.mock.calls[0]?.[2] as unknown as Record<string, unknown>;
  expect(Object.keys(payload).sort()).toEqual([
    'feeding_md',
    'reactivity_md',
    'vet_address',
    'vet_name',
    'vet_phone',
  ]);
});
