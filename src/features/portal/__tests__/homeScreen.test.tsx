import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import PortalHome from '@/app/(portal)/home';
import { ThemeProvider } from '@/src/ui/theme';

import type { PortalInvoice, PortalVisit } from '../api';
import type { PortalReportCard } from '../reportsApi';

const mockPush = jest.fn();
const mockSetLinkId = jest.fn(async () => {});

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Redirect: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/features/auth/session', () => ({
  signOut: jest.fn(async () => {}),
  useSession: () => ({ status: 'signed-in' }),
}));

jest.mock('@/src/features/portal/claim', () => ({ useClaimOnEmptyLinks: () => {} }));

const mockLink1 = { id: 'cu1', business_id: 'b1', client_id: 'c1' };
const mockLink2 = { id: 'cu2', business_id: 'b2', client_id: 'c2' };
const mockBiz1 = { id: 'b1', name: 'Paw & Whisker', brand_color: '#336699', time_zone: 'America/Chicago' };
const mockBiz2 = { id: 'b2', name: 'Other Dogs', brand_color: '#E8642C', time_zone: 'America/New_York' };

const mockState: {
  links: (typeof mockLink1)[];
  visits: PortalVisit[];
  reports: PortalReportCard[];
  invoices: PortalInvoice[];
} = { links: [mockLink1], visits: [], reports: [], invoices: [] };

// Task 5: home report rows read the archive query (it carries public_token).
// Pure helpers (reportHref) stay real; supabase is stubbed for the import.
jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/src/features/portal/reportsApi', () => ({
  ...jest.requireActual('@/src/features/portal/reportsApi'),
  useReportArchive: () => ({ isSuccess: true, data: mockState.reports }),
}));

jest.mock('@/src/features/portal/useClientLinks', () => ({
  useClientLinks: () => ({ isSuccess: true, data: mockState.links }),
}));

jest.mock('@/src/features/portal/hooks', () => ({
  usePortalScope: () => ({
    link: mockState.links[0] ?? null,
    links: mockState.links,
    business: mockBiz1,
    businesses: [mockBiz1, mockBiz2],
    setLinkId: mockSetLinkId,
  }),
  useUpcomingVisits: () => ({ isSuccess: true, data: mockState.visits }),
  usePortalSentInvoices: () => ({ isSuccess: true, data: mockState.invoices }),
  usePortalPets: () => ({
    isSuccess: true,
    data: [
      { id: 'p1', name: 'Biscuit' },
      { id: 'p2', name: 'Max' },
    ],
  }),
}));

function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <PortalHome />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const visit: PortalVisit = {
  id: 'v1',
  business_id: 'b1',
  client_id: 'c1',
  scheduled_start: '2026-08-27T19:00:00Z',
  scheduled_end: '2026-08-27T19:30:00Z',
  business_tz: 'America/Chicago',
  status: 'accepted',
  pet_ids: ['p1'],
  service: { name: 'Walk' },
};

const report: PortalReportCard = {
  id: 'r1',
  visit_id: 'v0',
  created_at: '2026-08-25T20:00:00Z',
  public_token: 'tok_r1',
  revoked_at: null,
  visit: {
    id: 'v0',
    client_id: 'c1',
    scheduled_start: '2026-08-25T19:00:00Z',
    business_tz: 'America/Chicago',
    status: 'completed',
    pet_ids: ['p1', 'p2'],
    service: { name: 'Walk' },
  },
};

const sentInvoice: PortalInvoice = {
  id: 'i1',
  client_id: 'c1',
  number: 7,
  status: 'sent',
  issued_on: '2026-08-24',
  due_on: null,
  items: [{ amount_cents: 4500 }],
  payments: [{ amount_cents: 1000 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockState.links = [mockLink1];
  mockState.visits = [];
  mockState.reports = [];
  mockState.invoices = [];
});

test('dashboard renders the three sections from data', async () => {
  mockState.visits = [visit];
  mockState.reports = [report];
  mockState.invoices = [sentInvoice];
  const { getByText, queryByLabelText } = await renderHome();
  // tenant branding
  expect(getByText('Paw & Whisker')).toBeTruthy();
  // (a) upcoming visit in the business zone with a client-facing chip
  expect(getByText('Thu, Aug 27 · 2:00 PM')).toBeTruthy();
  expect(getByText('Scheduled')).toBeTruthy();
  expect(getByText('Walk · Biscuit')).toBeTruthy();
  // (b) recent report card
  expect(getByText('Tue, Aug 25 · 2:00 PM')).toBeTruthy();
  expect(getByText('Walk · Biscuit & Max')).toBeTruthy();
  // (c) balance banner: 4500 − 1000
  expect(getByText('$35.00')).toBeTruthy();
  // single link -> no switcher
  expect(queryByLabelText('Show Paw & Whisker')).toBeNull();
});

test('brand-new client sees the empty states and no banner', async () => {
  const { getByText, queryByText } = await renderHome();
  expect(
    getByText('No visits yet — your pet care provider will schedule your first visit.'),
  ).toBeTruthy();
  expect(getByText('No report cards yet — they appear here after each visit.')).toBeTruthy();
  expect(queryByText('Balance due')).toBeNull();
});

test('balance banner routes to the Invoices tab', async () => {
  mockState.invoices = [sentInvoice];
  const { getByLabelText } = await renderHome();
  await fireEvent.press(getByLabelText('View invoices'));
  expect(mockPush).toHaveBeenCalledWith('/(portal)/invoices');
});

test('a report row deep-links to the public report page for its token', async () => {
  mockState.reports = [report];
  const { getByLabelText } = await renderHome();
  await fireEvent.press(getByLabelText('Open report card'));
  expect(mockPush).toHaveBeenCalledWith('/report/tok_r1');
});

test('a revoked report row falls back to the Reports tab', async () => {
  mockState.reports = [{ ...report, revoked_at: '2026-08-26T00:00:00Z' }];
  const { getByLabelText } = await renderHome();
  await fireEvent.press(getByLabelText('Open report card'));
  expect(mockPush).toHaveBeenCalledWith('/(portal)/reports');
});

test('multi-business client gets a switcher that rescopes the portal', async () => {
  mockState.links = [mockLink1, mockLink2];
  const { getByLabelText } = await renderHome();
  expect(getByLabelText('Show Paw & Whisker')).toBeTruthy();
  await fireEvent.press(getByLabelText('Show Other Dogs'));
  expect(mockSetLinkId).toHaveBeenCalledWith('cu2');
});
