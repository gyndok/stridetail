import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { OwnerBookingRequest } from '@/src/features/portal/requestsApi';
import { ThemeProvider } from '@/src/ui/theme';

import type { PickerContext, ScheduleMember } from '../api';
import { RequestCard } from '../RequestCard';

// The card renders for real; only the DATA layer is stubbed: pickerContext
// resolves a fixture (per test), and the native time picker is replaced by a
// pressable that picks 11:00 so the live-recompute path can be driven.

const mockPickerContext = jest.fn<Promise<PickerContext>, unknown[]>();

jest.mock('../api', () => ({
  pickerContext: (...args: unknown[]) => mockPickerContext(...args),
}));

jest.mock('@/src/ui/TimeField', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TimeField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
      React.createElement(
        Pressable,
        { testID: 'time-field', onPress: () => onChange('11:00') },
        React.createElement(Text, null, `time:${value}`),
      ),
  };
});

const tz = 'America/Chicago';

// Wed Jun 10 2026, window 9:00 AM – 2:00 PM Chicago (14:00Z – 19:00Z).
const REQUEST: OwnerBookingRequest = {
  id: 'r1',
  business_id: 'b1',
  client_id: 'c1',
  service_id: 's1',
  pet_ids: ['p1'],
  window_start: '2026-06-10T14:00:00Z',
  window_end: '2026-06-10T19:00:00Z',
  note_md: null,
  status: 'pending',
  created_at: '2026-06-09T14:00:00Z',
  client: { name: 'Dana' },
  service: { name: '30-min walk', duration_min: 30 },
};

const member = (user_id: string, display_name: string): ScheduleMember =>
  ({ user_id, role: 'walker', payout_percent: 50, display_name }) as ScheduleMember;

const MEMBERS = [
  member('u-off', 'Olive'),
  member('u-busy', 'Bud'),
  member('u-outside', 'Oscar'),
  member('u-free', 'Fred'),
];

// At the default 9:00 start: Olive is on time off (until 11:00 AM local), Bud
// has a 9:00–9:30 visit, Oscar's hours start at 10:00, Fred is free. At the
// picked 11:00 start every one of them is clear (Olive's block ENDS at 11:00 —
// touching does not overlap; Bud/Oscar/Fred have 8:00/10:00–18:00 rules).
const CTX: PickerContext = {
  rules: [
    { user_id: 'u-off', weekday: 3, start_local: '08:00', end_local: '18:00' },
    { user_id: 'u-busy', weekday: 3, start_local: '08:00', end_local: '18:00' },
    { user_id: 'u-outside', weekday: 3, start_local: '10:00', end_local: '18:00' },
    { user_id: 'u-free', weekday: 3, start_local: '08:00', end_local: '18:00' },
  ],
  timeOff: [{ user_id: 'u-off', starts_at: '2026-06-10T14:00:00Z', ends_at: '2026-06-10T16:00:00Z' }],
  visits: [
    {
      id: 'v1',
      walker_id: 'u-busy',
      scheduled_start: '2026-06-10T14:00:00Z',
      scheduled_end: '2026-06-10T14:30:00Z',
    },
  ],
};

async function renderCard(over?: { onApprove?: jest.Mock; request?: OwnerBookingRequest }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onApprove = over?.onApprove ?? jest.fn();
  const utils = await render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <RequestCard
          request={over?.request ?? REQUEST}
          tz={tz}
          members={MEMBERS}
          busy={false}
          onApprove={onApprove}
          onDecline={jest.fn()}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return Object.assign(utils, { onApprove });
}

beforeEach(() => {
  mockPickerContext.mockReset();
  mockPickerContext.mockResolvedValue(CTX);
});

test('chips show off / busy / outside-hours hints for the default start; free chips stay plain', async () => {
  const { findByText, getByText, queryByText } = await renderCard();

  expect(await findByText('Olive · off')).toBeTruthy();
  expect(getByText('Bud · busy 9:00 AM')).toBeTruthy();
  expect(getByText('Oscar · outside hours')).toBeTruthy();
  // Free walker: plain chip, no suffix.
  expect(getByText('Fred')).toBeTruthy();
  expect(queryByText(/Fred ·/)).toBeNull();

  // One batched fetch for the request's local day.
  expect(mockPickerContext).toHaveBeenCalledTimes(1);
  const [businessId, dayStart, dayEnd] = mockPickerContext.mock.calls[0] as [string, Date, Date];
  expect(businessId).toBe('b1');
  expect(dayStart.toISOString()).toBe('2026-06-10T05:00:00.000Z'); // local midnight CDT
  expect(dayEnd.toISOString()).toBe('2026-06-11T05:00:00.000Z');
});

test('hints recompute live when the owner edits the start time', async () => {
  const { findByText, getByTestId, getByText, queryByText } = await renderCard();

  expect(await findByText('Bud · busy 9:00 AM')).toBeTruthy();

  await fireEvent.press(getByTestId('time-field')); // picks 11:00

  await waitFor(() => expect(queryByText('Bud · busy 9:00 AM')).toBeNull());
  // Everyone is clear at 11:00 (Olive's time off ends exactly then).
  expect(getByText('Olive')).toBeTruthy();
  expect(getByText('Bud')).toBeTruthy();
  expect(getByText('Oscar')).toBeTruthy();
  expect(queryByText(/· (off|busy|outside)/)).toBeNull();
  // No refetch — same day, hints are pure recomputation.
  expect(mockPickerContext).toHaveBeenCalledTimes(1);
});

test('a hinted chip stays selectable and approves onto that walker', async () => {
  const { findByText, getByText, onApprove } = await renderCard();

  await fireEvent.press(await findByText('Olive · off'));
  await fireEvent.press(getByText('Approve'));

  expect(onApprove).toHaveBeenCalledTimes(1);
  expect(onApprove.mock.calls[0][0]).toBe('u-off');
  expect(onApprove.mock.calls[0][1]).toBeInstanceOf(Date);
});

test('while the context is loading, chips render as today with no hints', async () => {
  mockPickerContext.mockReturnValue(new Promise<PickerContext>(() => {}));
  const { getByText, queryByText } = await renderCard();

  expect(getByText('Olive')).toBeTruthy();
  expect(getByText('Fred')).toBeTruthy();
  expect(queryByText(/· (off|busy|outside)/)).toBeNull();
});

test('a request whose service was deactivated (no duration) never fetches and shows no hints', async () => {
  const { getByText, queryByText } = await renderCard({
    request: { ...REQUEST, service: null },
  });

  expect(getByText('Olive')).toBeTruthy();
  expect(queryByText(/· (off|busy|outside)/)).toBeNull();
  expect(mockPickerContext).not.toHaveBeenCalled();
});
