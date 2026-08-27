import { render } from '@testing-library/react-native';

import { ThemeProvider } from '@/src/ui/theme';

import { kpiWeekWindows } from '../kpiMath';
import { dashboardLayout, OwnerDashboard } from '../OwnerDashboard';
import type { DashboardKpis } from '../kpis';

// Shell test: the dashboard composes the KPI row, the operations row, and the
// schedule|business split, with the width -> composition decision covered as
// a pure function (dashboardLayout) plus prop-wiring checks at mocked widths.

const mockPush = jest.fn();

// Task 5: the shell reads useWindowDimensions to pick the composition; give
// the tests a dial. RN's index re-exports this module's default.
let mockWidth = 1280;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 900, scale: 2, fontScale: 1 }),
}));

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
// The panel stubs echo the layout props the shell hands them, so the width ->
// composition wiring is assertable without rendering the query-backed bodies
// (each panel's own test file covers those).
jest.mock('../SchedulePanel', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SchedulePanel: ({ layout = 'column' }: { layout?: string }) => (
      <Text>{`Schedule:${layout}`}</Text>
    ),
  };
});
jest.mock('../OperationsPanel', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    OperationsPanel: ({ columns = 1 }: { columns?: number }) => (
      <Text>{`Operations:${columns}`}</Text>
    ),
  };
});

function renderShell(width: number) {
  mockWidth = width;
  return render(
    <ThemeProvider>
      <OwnerDashboard />
    </ThemeProvider>,
  );
}

test('dashboardLayout: ops row and schedule split per breakpoint', () => {
  expect(dashboardLayout(1024)).toEqual({ opsColumns: 2, schedule: 'column' });
  expect(dashboardLayout(1279)).toEqual({ opsColumns: 2, schedule: 'column' });
  expect(dashboardLayout(1280)).toEqual({ opsColumns: 3, schedule: 'column' });
  expect(dashboardLayout(1600)).toEqual({ opsColumns: 3, schedule: 'row' });
});

test('shell renders title, KPI row, operations row, and the schedule|business split', async () => {
  const { getByText, getByTestId } = await renderShell(1280);
  expect(getByText('Today')).toBeTruthy();
  expect(getByText('Revenue this week')).toBeTruthy();
  expect(getByText('$100.00')).toBeTruthy();
  expect(getByText('Operations:3')).toBeTruthy();
  expect(getByText('Schedule:column')).toBeTruthy();
  expect(getByText('Clients & pets')).toBeTruthy(); // Task 4 business column
  // Schedule gets the wide slot of the ~2:1 main row, business the narrow one.
  expect(getByTestId('dashboard-schedule-slot')).toHaveStyle({ flexGrow: 2, flexBasis: '58%' });
  expect(getByTestId('dashboard-business-slot')).toHaveStyle({ flexGrow: 1, flexBasis: '32%' });
});

test('1024-1279 band: two-across operations, stacked schedule column', async () => {
  const { getByText } = await renderShell(1024);
  expect(getByText('Operations:2')).toBeTruthy();
  expect(getByText('Schedule:column')).toBeTruthy();
});

test('>= 1600: table and month calendar sit side by side in the schedule slot', async () => {
  const { getByText } = await renderShell(1600);
  expect(getByText('Operations:3')).toBeTruthy();
  expect(getByText('Schedule:row')).toBeTruthy();
});
