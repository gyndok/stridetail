import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import { visitDayLabel, type Visit } from '@/src/features/schedule/api';
import type { OwnerBookingRequest } from '@/src/features/portal/requestsApi';
import { ThemeProvider } from '@/src/ui/theme';

import { OperationsPanel } from '../OperationsPanel';

// Panel test: composition from mocked DATA — the query hooks are stubbed, the
// selectors/formatters and the shared RequestCard render for real. The query
// client is real (useRequestActions needs one) but nothing fetches.

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: () => {},
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

// Native time picker stays out of the jest render (the picker widget itself is
// untested per project precedent; the card around it is what matters here).
jest.mock('@/src/ui/TimeField', () => ({ TimeField: () => null }));

let mockOpsData: {
  visits: { data: Visit[] | undefined };
  notifications: { data: { channel: string; status: string }[] | undefined };
  requests: {
    data: OwnerBookingRequest[] | undefined;
    isLoading: boolean;
    isSuccess: boolean;
    refetch: jest.Mock;
  };
  members: { data: { user_id: string; role: 'owner' | 'walker'; display_name: string | null }[] };
};
let mockWalkPetNames: Record<string, string> | undefined;

jest.mock('../operationsData', () => ({
  ...jest.requireActual('../operationsData'),
  useOperationsData: () => mockOpsData,
  useWalkPetNames: () => ({ data: mockWalkPetNames }),
}));

const nowMs = Date.now();
const iso = (offsetMs: number) => new Date(nowMs + offsetMs).toISOString();
const HOUR = 3_600_000;

const visit = (over: Partial<Visit>): Visit =>
  ({
    id: 'v0',
    business_id: 'b1',
    client_id: 'c1',
    service_id: 's1',
    series_id: null,
    walker_id: null,
    pet_ids: [],
    scheduled_start: iso(HOUR),
    scheduled_end: iso(1.5 * HOUR),
    business_tz: 'America/Chicago',
    status: 'unassigned',
    owner_notes_md: null,
    decline_reason: null,
    started_at: null,
    finished_at: null,
    client: { name: 'Alice' },
    service: { name: 'Walk', duration_min: 30 },
    ...over,
  }) as Visit;

const REQUEST: OwnerBookingRequest = {
  id: 'r1',
  business_id: 'b1',
  client_id: 'c1',
  service_id: 's1',
  pet_ids: ['p1'],
  window_start: iso(2 * HOUR),
  window_end: iso(4 * HOUR),
  note_md: null,
  status: 'pending',
  created_at: iso(-HOUR),
  client: { name: 'Dana' },
  service: { name: '30-min walk', duration_min: 30 },
};

const V_UNASSIGNED = visit({ id: 'v1' });
const V_DECLINED = visit({
  id: 'v2',
  scheduled_start: iso(2 * HOUR),
  scheduled_end: iso(2.5 * HOUR),
  decline_reason: 'Walker sick',
  client: { name: 'Carol' },
  service: { name: 'Puppy visit', duration_min: 20 },
});
const V_MISSED = visit({
  id: 'v3',
  status: 'accepted',
  scheduled_start: iso(-3 * HOUR),
  scheduled_end: iso(-2 * HOUR),
  client: { name: 'Max' },
});
const V_WALKING = visit({
  id: 'w1',
  status: 'in_progress',
  walker_id: 'u2',
  pet_ids: ['p1', 'p2'],
  scheduled_start: iso(-0.5 * HOUR),
  scheduled_end: iso(0.5 * HOUR),
  started_at: iso(-12 * 60_000),
  client: { name: 'Bob' },
});

const MEMBERS = [{ user_id: 'u2', role: 'walker' as const, display_name: 'Wendy' }];

function setData(over?: Partial<typeof mockOpsData>) {
  mockOpsData = {
    visits: { data: [] },
    notifications: { data: [] },
    requests: { data: [], isLoading: false, isSuccess: true, refetch: jest.fn() },
    members: { data: [] },
    ...over,
  };
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <OperationsPanel />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockWalkPetNames = undefined;
  setData();
});

test('renders the request card, attention rows, and live walks from data', async () => {
  setData({
    visits: { data: [V_UNASSIGNED, V_DECLINED, V_MISSED, V_WALKING] },
    notifications: { data: [{ channel: 'email', status: 'failed' }] },
    requests: { data: [REQUEST], isLoading: false, isSuccess: true, refetch: jest.fn() },
    members: { data: MEMBERS },
  });
  mockWalkPetNames = { p1: 'Fido', p2: 'Rex' };
  const { getByText, getAllByText } = await renderPanel();

  expect(getByText('Pending requests')).toBeTruthy();
  expect(getByText('Needs attention')).toBeTruthy();
  expect(getByText('Out on walks now')).toBeTruthy();

  // The shared approve/decline card renders inline for the pending request.
  expect(getByText('Dana · 30-min walk')).toBeTruthy();
  expect(getByText('Approve')).toBeTruthy();
  expect(getByText('Decline')).toBeTruthy();

  // Needs attention: count, preview rows, missed line, undelivered, declined.
  expect(getByText('2 unassigned visits in the next 14 days')).toBeTruthy();
  expect(getByText(`${visitDayLabel(V_UNASSIGNED)} · Alice · Walk`)).toBeTruthy();
  expect(getByText(`${visitDayLabel(V_DECLINED)} · Carol · Puppy visit`)).toBeTruthy();
  expect(getByText('1 visit missed — review in Schedule')).toBeTruthy();
  expect(getByText('1 email not delivered')).toBeTruthy();
  expect(getByText('Declined: Walker sick')).toBeTruthy();

  // Out on walks now: walker, client + pets, live "started X min ago".
  // 'Wendy' renders twice on purpose: the request card's walker chip AND the
  // live-walk row.
  expect(getAllByText('Wendy')).toHaveLength(2);
  expect(getByText('Bob · Fido, Rex')).toBeTruthy();
  expect(getByText('started 12 min ago')).toBeTruthy();
});

test('rows tap through to their targets', async () => {
  setData({
    visits: { data: [V_UNASSIGNED, V_DECLINED, V_MISSED, V_WALKING] },
    requests: { data: [], isLoading: false, isSuccess: true, refetch: jest.fn() },
    members: { data: MEMBERS },
  });
  const { getByText } = await renderPanel();

  await fireEvent.press(getByText('View all'));
  expect(mockPush).toHaveBeenLastCalledWith('/requests');
  await fireEvent.press(getByText(`${visitDayLabel(V_UNASSIGNED)} · Alice · Walk`));
  expect(mockPush).toHaveBeenLastCalledWith('/schedule/v1');
  await fireEvent.press(getByText('Declined: Walker sick'));
  expect(mockPush).toHaveBeenLastCalledWith('/schedule/v2');
  await fireEvent.press(getByText('1 visit missed — review in Schedule'));
  expect(mockPush).toHaveBeenLastCalledWith('/schedule');
  await fireEvent.press(getByText('Wendy'));
  expect(mockPush).toHaveBeenLastCalledWith('/schedule/w1');
});

test('empty states for all three cards', async () => {
  const { getByText } = await renderPanel();
  expect(getByText('No requests waiting.')).toBeTruthy();
  expect(getByText('Nothing needs attention.')).toBeTruthy();
  expect(getByText('No one is out right now.')).toBeTruthy();
});
