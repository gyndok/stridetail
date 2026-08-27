import { fireEvent, render } from '@testing-library/react-native';

import { ThemeProvider } from '@/src/ui/theme';

import { KpiRow } from '../KpiRow';
import { kpiWeekWindows } from '../kpiMath';
import type { DashboardKpis } from '../kpis';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const KPIS: DashboardKpis = {
  windows: kpiWeekWindows(new Date('2026-08-26T12:00:00Z'), 'America/Chicago'),
  revenue: { currentCents: 32_500, previousCents: 30_000, deltaCents: 2500 },
  clients: { clients: 12, pets: 17 },
  walks: { completed: 9, total: 14 },
  outstanding: { totalCents: 8100, unpaidCount: 3 },
};

const renderRow = (kpis: DashboardKpis | undefined) =>
  render(
    <ThemeProvider>
      <KpiRow kpis={kpis} />
    </ThemeProvider>,
  );

beforeEach(() => mockPush.mockClear());

test('renders the four cards with formatted values', async () => {
  const { getByText } = await renderRow(KPIS);
  expect(getByText('Revenue this week')).toBeTruthy();
  expect(getByText('$325.00')).toBeTruthy();
  expect(getByText('▲ $25.00 vs last week')).toBeTruthy();
  expect(getByText('Active clients')).toBeTruthy();
  expect(getByText('12')).toBeTruthy();
  expect(getByText('17 pets')).toBeTruthy();
  expect(getByText('Walks this week')).toBeTruthy();
  expect(getByText('9/14')).toBeTruthy();
  expect(getByText('Outstanding')).toBeTruthy();
  expect(getByText('$81.00')).toBeTruthy();
  expect(getByText('3 unpaid invoices')).toBeTruthy();
});

test('cards tap through to their screens', async () => {
  const { getByLabelText } = await renderRow(KPIS);
  await fireEvent.press(getByLabelText('Revenue this week'));
  expect(mockPush).toHaveBeenLastCalledWith('/billing');
  await fireEvent.press(getByLabelText('Active clients'));
  expect(mockPush).toHaveBeenLastCalledWith('/clients');
  await fireEvent.press(getByLabelText('Walks this week'));
  expect(mockPush).toHaveBeenLastCalledWith('/schedule');
  await fireEvent.press(getByLabelText('Outstanding'));
  expect(mockPush).toHaveBeenLastCalledWith('/billing');
  expect(mockPush).toHaveBeenCalledTimes(4);
});

test('without data the row renders four quiet placeholders', async () => {
  const { getAllByText, queryByText } = await renderRow(undefined);
  expect(getAllByText('—')).toHaveLength(4);
  expect(queryByText('Revenue this week')).toBeNull();
});
