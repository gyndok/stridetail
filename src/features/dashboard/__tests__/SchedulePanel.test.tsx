import { fireEvent, render } from '@testing-library/react-native';

import type { ScheduleMember, Visit } from '@/src/features/schedule/api';
import { ThemeProvider } from '@/src/ui/theme';

import { currentYm, monthTitle, todayYmd } from '../scheduleData';
import { SchedulePanel } from '../SchedulePanel';

// Plan 8b Task 3 — the panel renders the week table and the month
// mini-calendar from mocked query data; row shaping itself is covered by
// scheduleData.test.ts.

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

jest.mock('@/src/lib/supabase', () => ({ supabase: {} }));

const TZ = 'America/Chicago';

const members: ScheduleMember[] = [
  { user_id: 'u-owner', role: 'owner', display_name: 'Alexandra' },
  { user_id: 'u-ben', role: 'walker', display_name: 'Ben' },
];

function makeVisit(over: Partial<Visit> & { id: string; scheduled_start: string }): Visit {
  return {
    business_id: 'b1',
    client_id: 'c1',
    service_id: 's1',
    series_id: null,
    walker_id: 'u-ben',
    pet_ids: ['p1'],
    scheduled_end: new Date(new Date(over.scheduled_start).getTime() + 1_800_000).toISOString(),
    business_tz: TZ,
    status: 'accepted',
    owner_notes_md: null,
    decline_reason: null,
    started_at: null,
    finished_at: null,
    client: { name: 'Dana' },
    service: { name: '30-min walk', duration_min: 30 },
    ...over,
  };
}

// Visits land "this week" relative to the panel's `new Date()` anchor.
const now = new Date();
const soon = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

const mockState: {
  visits: Visit[];
  petNamesById: Map<string, string>;
  counts: Map<string, number>;
} = { visits: [], petNamesById: new Map(), counts: new Map() };

jest.mock('../scheduleData', () => ({
  ...jest.requireActual('../scheduleData'),
  useWeekSchedule: () => ({
    data: { visits: mockState.visits, petNamesById: mockState.petNamesById },
    isLoading: false,
    isSuccess: true,
    error: null,
  }),
  useMonthVisitCounts: () => ({ data: mockState.counts, isLoading: false, error: null }),
  useScheduleMembers: () => ({ data: members, isLoading: false, error: null }),
}));

function renderPanel() {
  return render(
    <ThemeProvider>
      <SchedulePanel />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockState.visits = [];
  mockState.petNamesById = new Map();
  mockState.counts = new Map();
});

test('renders week rows, walker names, unassigned chip, and status pills', async () => {
  mockState.visits = [
    makeVisit({ id: 'v1', scheduled_start: soon(2), pet_ids: ['p1', 'p2'] }),
    makeVisit({ id: 'v2', scheduled_start: soon(3), walker_id: null, status: 'unassigned' }),
  ];
  mockState.petNamesById = new Map([
    ['p1', 'Rex'],
    ['p2', 'Bella'],
  ]);
  const { getByText, getAllByText } = await renderPanel();
  expect(getByText('This week')).toBeTruthy();
  expect(getAllByText('Dana').length).toBe(2); // both visits belong to Dana
  expect(getByText('Rex, Bella')).toBeTruthy();
  expect(getAllByText('30-min walk').length).toBe(2);
  expect(getAllByText('Ben').length).toBe(2); // walker cell + filter chip
  expect(getAllByText('Unassigned').length).toBeGreaterThanOrEqual(2); // walker chip + status pill
  expect(getByText('Accepted')).toBeTruthy();
  // Month card renders the current month's title.
  expect(getByText('Month')).toBeTruthy();
  expect(getByText(monthTitle(currentYm(now, TZ)))).toBeTruthy();
});

test('row tap opens the visit screen route', async () => {
  mockState.visits = [makeVisit({ id: 'v1', scheduled_start: soon(2) })];
  const { getByText } = await renderPanel();
  await fireEvent.press(getByText('30-min walk'));
  expect(mockPush).toHaveBeenCalledWith('/schedule/v1');
});

test('walker filter chips narrow the table', async () => {
  mockState.visits = [
    makeVisit({ id: 'v1', scheduled_start: soon(2), client: { name: 'Dana' } }),
    makeVisit({
      id: 'v2',
      scheduled_start: soon(3),
      walker_id: 'u-owner',
      client: { name: 'Priya' },
    }),
  ];
  const { getByText, queryByText, getAllByText } = await renderPanel();
  expect(getByText('Priya')).toBeTruthy();
  // The 'Alexandra' chip narrows to the owner's visits; text appears as both
  // chip and walker cell, so press the chip (first occurrence).
  await fireEvent.press(getAllByText('Alexandra')[0]!);
  expect(getByText('Priya')).toBeTruthy();
  expect(queryByText('Dana')).toBeNull();
});

test('caps visible rows at 12 with a "+N more this week" link to the schedule tab', async () => {
  mockState.visits = Array.from({ length: 14 }, (_, i) =>
    makeVisit({ id: `v${i}`, scheduled_start: soon(i + 1), client: { name: `Client ${i}` } }),
  );
  const { getByText, queryByText } = await renderPanel();
  expect(getByText('+2 more this week')).toBeTruthy();
  expect(queryByText('Client 13')).toBeNull();
  await fireEvent.press(getByText('+2 more this week'));
  expect(mockPush).toHaveBeenCalledWith('/schedule');
});

test('empty week shows the empty state', async () => {
  const { getByText } = await renderPanel();
  expect(getByText('No visits this week.')).toBeTruthy();
});

test('month calendar shows per-day count badges and day tap opens the schedule tab', async () => {
  const today = todayYmd(now, TZ);
  // 99 cannot collide with a day-of-month number in the grid.
  mockState.counts = new Map([[today, 99]]);
  const { getByText, getByLabelText } = await renderPanel();
  expect(getByText('99')).toBeTruthy();
  await fireEvent.press(getByLabelText(`Open schedule, ${today}`));
  expect(mockPush).toHaveBeenCalledWith('/schedule');
});
