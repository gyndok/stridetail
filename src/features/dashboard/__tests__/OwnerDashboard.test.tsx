import { render } from '@testing-library/react-native';

import { ThemeProvider } from '@/src/ui/theme';

import { kpiWeekWindows } from '../kpiMath';
import { OwnerDashboard } from '../OwnerDashboard';
import type { DashboardKpis } from '../kpis';

// Shell test: the dashboard composes the KPI row and the three stub panel
// slots. The panels are the real (Task 1 stub) components — Tasks 2-4 replace
// those files, and this test keeps asserting the slots exist.

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/features/business/active', () => ({
  useActiveBusiness: () => ({ businessId: 'b1' }),
}));

jest.mock('@/src/features/business/useMemberships', () => ({
  useMemberships: () => ({
    data: [
      {
        business_id: 'b1',
        role: 'owner',
        business: { id: 'b1', name: 'Paw & Whisker', time_zone: 'America/Chicago' },
      },
    ],
  }),
}));

const mockKpis: DashboardKpis = {
  windows: kpiWeekWindows(new Date('2026-08-26T12:00:00Z'), 'America/Chicago'),
  revenue: { currentCents: 10_000, previousCents: 5000, deltaCents: 5000 },
  clients: { clients: 4, pets: 6 },
  walks: { completed: 2, total: 3 },
  outstanding: { totalCents: 0, unpaidCount: 0 },
};

jest.mock('@/src/features/dashboard/kpis', () => ({
  ...jest.requireActual('@/src/features/dashboard/kpis'),
  useDashboardKpis: () => ({ data: mockKpis, isLoading: false }),
}));

// Task 4 replaced the BusinessPanel stub with live hooks; stub their data here.
jest.mock('@/src/features/dashboard/businessData', () => ({
  ...jest.requireActual('@/src/features/dashboard/businessData'),
  useBusinessClients: () => ({ data: [], error: null }),
  useBusinessServices: () => ({ data: [], error: null }),
  useBusinessBilling: () => ({ data: { invoices: [], unbilledCount: 0 }, error: null }),
}));
// Task 3 replaced the SchedulePanel stub with a query-backed panel (its own
// SchedulePanel.test.tsx covers the real body); the shell test only asserts
// the slot exists, so mock it to its slot marker.
jest.mock('../SchedulePanel', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SchedulePanel: () => <Text>Schedule</Text> };
});

test('shell renders the title, KPI row, and the three panel stubs', async () => {
  const { getByText } = await render(
    <ThemeProvider>
      <OwnerDashboard />
    </ThemeProvider>,
  );
  expect(getByText('Today')).toBeTruthy();
  expect(getByText('Revenue this week')).toBeTruthy();
  expect(getByText('$100.00')).toBeTruthy();
  expect(getByText('Operations')).toBeTruthy();
  expect(getByText('Schedule')).toBeTruthy();
  expect(getByText('Clients & pets')).toBeTruthy(); // Task 4 business column
  // Operations is the one remaining stub (Task 2); Task 3's slot is mocked above.
  expect(getByText('Requests, needs attention, and live walks — coming in the next task.')).toBeTruthy();
});
