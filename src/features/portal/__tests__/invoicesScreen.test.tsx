import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import PortalInvoices from '@/app/(portal)/invoices';
import { ThemeProvider } from '@/src/ui/theme';

import type { PortalInvoiceListRow } from '../invoicesApi';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Redirect: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockBiz = { id: 'b1', name: 'Paw & Whisker', brand_color: '#336699', time_zone: 'America/Chicago' };
const mockLink = { id: 'cu1', business_id: 'b1', client_id: 'c1' };

const mockState: { invoices: PortalInvoiceListRow[] } = { invoices: [] };

jest.mock('@/src/features/portal/hooks', () => ({
  usePortalScope: () => ({
    link: mockLink,
    links: [mockLink],
    business: mockBiz,
    businesses: [mockBiz],
    setLinkId: jest.fn(),
  }),
}));

// Pure helpers (vm, hrefs, money math) stay real; only the query hook is stubbed.
jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/src/features/portal/invoicesApi', () => ({
  ...jest.requireActual('@/src/features/portal/invoicesApi'),
  usePortalInvoiceList: () => ({ isSuccess: true, data: mockState.invoices }),
}));

function row(over: Partial<PortalInvoiceListRow>): PortalInvoiceListRow {
  return {
    id: 'i1',
    client_id: 'c1',
    number: 7,
    status: 'sent',
    issued_on: '2026-08-24',
    due_on: null,
    public_token: 'tok_i1',
    revoked_at: null,
    items: [{ amount_cents: 4500 }],
    payments: [],
    ...over,
  };
}

function renderInvoices() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <PortalInvoices />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.invoices = [];
});

test('unpaid invoice row: number, chip, total, balance, pay affordance', async () => {
  mockState.invoices = [row({ payments: [{ amount_cents: 1000 }] })];
  const { getByText } = await renderInvoices();
  expect(getByText('INV-0007')).toBeTruthy();
  expect(getByText('Partially paid')).toBeTruthy();
  expect(getByText('Issued Aug 24, 2026')).toBeTruthy();
  expect(getByText('Total $45.00')).toBeTruthy();
  expect(getByText('Balance $35.00')).toBeTruthy();
  // The unpaid detail is where the tip chips + Venmo button live.
  expect(getByText('View & pay →')).toBeTruthy();
});

test('sent with no payments reads Awaiting payment', async () => {
  mockState.invoices = [row({})];
  const { getByText } = await renderInvoices();
  expect(getByText('Awaiting payment')).toBeTruthy();
});

test('a row routes to the public invoice page for its own token', async () => {
  mockState.invoices = [row({})];
  const { getByLabelText } = await renderInvoices();
  await fireEvent.press(getByLabelText('Open INV-0007'));
  expect(mockPush).toHaveBeenCalledWith('/invoice/tok_i1');
});

test('paid invoice: green chip, no balance line, plain view link', async () => {
  mockState.invoices = [row({ status: 'paid', payments: [{ amount_cents: 4500 }] })];
  const { getByText, queryByText } = await renderInvoices();
  expect(getByText('Paid')).toBeTruthy();
  expect(queryByText(/^Balance /)).toBeNull();
  expect(getByText('View invoice →')).toBeTruthy();
});

test('a tokenless invoice keeps its row without a detail link', async () => {
  mockState.invoices = [row({ public_token: null })];
  const { getByText, queryByLabelText, queryByText } = await renderInvoices();
  expect(getByText('INV-0007')).toBeTruthy();
  expect(queryByLabelText('Open INV-0007')).toBeNull();
  expect(queryByText('View & pay →')).toBeNull();
});

test('empty list shows the friendly empty state', async () => {
  const { getByText } = await renderInvoices();
  expect(
    getByText('No invoices yet — they appear here when your pet care provider sends one.'),
  ).toBeTruthy();
});
