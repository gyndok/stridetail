import { fireEvent, render } from '@testing-library/react-native';

import type { InvoiceListItem } from '@/src/features/billing/api';
import { ThemeProvider } from '@/src/ui/theme';

import { BusinessPanel } from '../BusinessPanel';
import type { BusinessClientRow } from '../businessData';
import type { Service } from '@/src/features/services/types';

// Panel test: mock the three businessData hooks (the pure shaping functions
// stay real) and assert the three cards render rows, flags, rollups, and
// empty states from the mocked data.

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/src/features/business/active', () => ({
  useActiveBusiness: () => ({ businessId: 'b1' }),
}));

const clients: BusinessClientRow[] = [
  {
    id: 'c1',
    name: 'Dana Smith',
    phones: ['555-0100'],
    email: null,
    mg_completed_at: null,
    portal_invited_at: null,
    pets: [
      { id: 'p1', name: 'Olive', species: 'dog' },
      { id: 'p2', name: 'Baxter', species: 'dog' },
    ],
  },
  {
    id: 'c2',
    name: 'Lee Wong',
    phones: [],
    email: 'lee@example.com',
    mg_completed_at: '2026-08-01T00:00:00Z',
    portal_invited_at: null,
    pets: [{ id: 'p3', name: 'Miso', species: 'cat' }],
  },
];

const services: Service[] = [
  {
    id: 's1',
    business_id: 'b1',
    name: '30-min walk',
    kind: 'walk',
    base_price_cents: 2500,
    extra_pet_price_cents: 500,
    duration_min: 30,
    requires_gps: true,
    active: true,
    created_at: '',
    updated_at: '',
  },
  {
    id: 's2',
    business_id: 'b1',
    name: 'Drop-in',
    kind: 'dropin',
    base_price_cents: 2000,
    extra_pet_price_cents: 0,
    duration_min: 20,
    requires_gps: false,
    active: true,
    created_at: '',
    updated_at: '',
  },
];

const invoices: InvoiceListItem[] = [
  {
    id: 'i1',
    business_id: 'b1',
    client_id: 'c1',
    number: 12,
    status: 'sent',
    issued_on: '2026-08-20',
    due_on: null,
    sent_at: '2026-08-20T00:00:00Z',
    paid_at: null,
    client: { name: 'Dana' },
    items: [{ amount_cents: 5000 }],
    payments: [],
  },
  {
    id: 'i2',
    business_id: 'b1',
    client_id: 'c2',
    number: 11,
    status: 'paid',
    issued_on: '2026-08-18',
    due_on: null,
    sent_at: '2026-08-18T00:00:00Z',
    paid_at: '2026-08-19T00:00:00Z',
    client: { name: 'Lee' },
    items: [{ amount_cents: 2000 }],
    payments: [{ amount_cents: 2000 }],
  },
];

const hookState = {
  clients: { data: clients as BusinessClientRow[] | undefined, error: null as unknown },
  services: { data: services as Service[] | undefined, error: null as unknown },
  billing: {
    data: { invoices, unbilledCount: 3 } as
      | { invoices: InvoiceListItem[]; unbilledCount: number }
      | undefined,
    error: null as unknown,
  },
};

jest.mock('../businessData', () => ({
  ...jest.requireActual('../businessData'),
  useBusinessClients: () => hookState.clients,
  useBusinessServices: () => hookState.services,
  useBusinessBilling: () => hookState.billing,
}));

beforeEach(() => {
  mockPush.mockClear();
  hookState.clients = { data: clients, error: null };
  hookState.services = { data: services, error: null };
  hookState.billing = { data: { invoices, unbilledCount: 3 }, error: null };
});

const renderPanel = () =>
  render(
    <ThemeProvider>
      <BusinessPanel />
    </ThemeProvider>,
  );

test('renders the three cards with rows from the mocked data', async () => {
  const { getByText } = await renderPanel();
  // Clients & pets
  expect(getByText('Clients & pets')).toBeTruthy();
  expect(getByText('Dana Smith')).toBeTruthy();
  expect(getByText(/Baxter \(dog\), Olive \(dog\)/)).toBeTruthy();
  expect(getByText(/555-0100/)).toBeTruthy();
  expect(getByText('No email')).toBeTruthy();
  expect(getByText('M&G pending')).toBeTruthy();
  // Services
  expect(getByText('Services')).toBeTruthy();
  expect(getByText('30-min walk')).toBeTruthy();
  expect(getByText(/30 min · \$25\.00 · \+\$5\.00\/extra pet/)).toBeTruthy();
  expect(getByText(/20 min · \$20\.00$/)).toBeTruthy();
  // Billing
  expect(getByText('Billing')).toBeTruthy();
  expect(getByText(/Outstanding \$50\.00/)).toBeTruthy();
  expect(getByText(/3 unbilled visits/)).toBeTruthy();
  expect(getByText('INV-0012')).toBeTruthy();
  expect(getByText('$50.00')).toBeTruthy();
  expect(getByText('Paid')).toBeTruthy();
});

test('search filters the roster by client or pet name', async () => {
  const { getByLabelText, getByText, queryByText } = await renderPanel();
  await fireEvent.changeText(getByLabelText('Search clients'), 'miso');
  expect(getByText('Lee Wong')).toBeTruthy();
  expect(queryByText('Dana Smith')).toBeNull();
  await fireEvent.changeText(getByLabelText('Search clients'), 'zzz');
  expect(getByText('No clients match your search.')).toBeTruthy();
});

test('rows and actions navigate to the existing screens', async () => {
  const { getByText } = await renderPanel();
  await fireEvent.press(getByText('Dana Smith'));
  expect(mockPush).toHaveBeenCalledWith('/clients/c1');
  await fireEvent.press(getByText('Add client'));
  expect(mockPush).toHaveBeenCalledWith('/clients/new');
  await fireEvent.press(getByText('30-min walk'));
  expect(mockPush).toHaveBeenCalledWith('/settings/services');
  await fireEvent.press(getByText('INV-0012'));
  expect(mockPush).toHaveBeenCalledWith('/billing/i1');
  await fireEvent.press(getByText('New invoice'));
  expect(mockPush).toHaveBeenCalledWith('/billing/new');
  await fireEvent.press(getByText('View billing'));
  expect(mockPush).toHaveBeenCalledWith('/billing');
});

test('caps the roster at 8 rows with a "+N more" link to the clients tab', async () => {
  hookState.clients = {
    data: Array.from({ length: 11 }, (_, i) => ({
      id: `c${i}`,
      name: `Client ${String.fromCharCode(65 + i)}`,
      phones: [],
      email: 'x@y.z',
      mg_completed_at: '2026-08-01T00:00:00Z',
      portal_invited_at: null,
      pets: [],
    })),
    error: null,
  };
  const { getByText, queryByText } = await renderPanel();
  expect(getByText('Client A')).toBeTruthy();
  expect(queryByText('Client I')).toBeNull(); // row 9 is capped
  await fireEvent.press(getByText('+3 more'));
  expect(mockPush).toHaveBeenCalledWith('/clients');
});

test('empty states for all three cards', async () => {
  hookState.clients = { data: [], error: null };
  hookState.services = { data: [], error: null };
  hookState.billing = { data: { invoices: [], unbilledCount: 0 }, error: null };
  const { getByText } = await renderPanel();
  expect(getByText('No clients yet.')).toBeTruthy();
  expect(getByText('No services yet.')).toBeTruthy();
  expect(getByText('No invoices yet.')).toBeTruthy();
});
