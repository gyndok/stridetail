import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import PortalReports from '@/app/(portal)/reports';
import { ThemeProvider } from '@/src/ui/theme';

import type { PortalReportCard } from '../reportsApi';

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

const mockState: { reports: PortalReportCard[] } = { reports: [] };

jest.mock('@/src/features/portal/hooks', () => ({
  usePortalScope: () => ({
    link: mockLink,
    links: [mockLink],
    business: mockBiz,
    businesses: [mockBiz],
    setLinkId: jest.fn(),
  }),
  usePortalPets: () => ({
    isSuccess: true,
    data: [
      { id: 'p1', name: 'Biscuit' },
      { id: 'p2', name: 'Max' },
    ],
  }),
}));

// Pure helpers (grouping, hrefs) stay real; only the query hook is stubbed.
jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/src/features/portal/reportsApi', () => ({
  ...jest.requireActual('@/src/features/portal/reportsApi'),
  useReportArchive: () => ({ isSuccess: true, data: mockState.reports }),
}));

function card(over: Partial<PortalReportCard> & { scheduled_start?: string }): PortalReportCard {
  return {
    id: over.id ?? 'r1',
    visit_id: 'v1',
    created_at: '2026-08-25T20:00:00Z',
    public_token: over.public_token ?? 'tok1',
    revoked_at: over.revoked_at ?? null,
    visit: {
      id: 'v1',
      client_id: 'c1',
      scheduled_start: over.scheduled_start ?? '2026-08-25T19:00:00Z',
      business_tz: 'America/Chicago',
      status: 'completed',
      pet_ids: ['p1', 'p2'],
      service: { name: 'Walk' },
    },
  };
}

function renderReports() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <PortalReports />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.reports = [];
});

test('archive renders month headers and rows from data', async () => {
  mockState.reports = [
    card({ id: 'aug', scheduled_start: '2026-08-25T19:00:00Z', public_token: 'tokAug' }),
    card({ id: 'jul', scheduled_start: '2026-07-10T19:00:00Z', public_token: 'tokJul' }),
  ];
  const { getByText, getAllByText } = await renderReports();
  expect(getByText('August 2026')).toBeTruthy();
  expect(getByText('July 2026')).toBeTruthy();
  expect(getByText('Tue, Aug 25 · 2:00 PM')).toBeTruthy();
  expect(getByText('Fri, Jul 10 · 2:00 PM')).toBeTruthy();
  // Both rows carry the same service · pets line.
  expect(getAllByText('Walk · Biscuit & Max')).toHaveLength(2);
});

test('a row routes to the public report page for its own token', async () => {
  mockState.reports = [card({ public_token: 'tokAug' })];
  const { getByLabelText } = await renderReports();
  await fireEvent.press(getByLabelText('Open report card Tue, Aug 25 · 2:00 PM'));
  expect(mockPush).toHaveBeenCalledWith('/report/tokAug');
});

test('a revoked report keeps its row, marked unavailable, with no link', async () => {
  mockState.reports = [card({ revoked_at: '2026-08-26T00:00:00Z' })];
  const { getByText, queryByLabelText } = await renderReports();
  expect(getByText('Tue, Aug 25 · 2:00 PM')).toBeTruthy();
  expect(getByText('Unavailable')).toBeTruthy();
  expect(queryByLabelText('Open report card Tue, Aug 25 · 2:00 PM')).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
});

test('empty archive shows the friendly empty state', async () => {
  const { getByText } = await renderReports();
  expect(getByText('No report cards yet — they appear here after each visit.')).toBeTruthy();
});
