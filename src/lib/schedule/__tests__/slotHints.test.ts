import { slotHintLabel, walkerSlotHints, type SlotHintData } from '../slotHints';

const tz = 'America/Chicago';
const iso = (s: string) => new Date(s);

// Wed Jun 10 2026, 9:00 AM America/Chicago (CDT, UTC-5) = 14:00Z.
const NINE_AM = iso('2026-06-10T14:00:00Z');

const empty: SlotHintData = { availability: [], timeOff: [], visits: [] };

const data = (over: Partial<SlotHintData>): SlotHintData => ({ ...empty, ...over });

const wedAllDay = (userId: string) => ({
  user_id: userId,
  weekday: 3,
  start_local: '08:00',
  end_local: '18:00',
});

describe('walkerSlotHints', () => {
  test('free: slot inside an availability rule, no time off, no visits', () => {
    const d = data({ availability: [wedAllDay('w1')] });
    expect(walkerSlotHints('w1', NINE_AM, 30, d, tz)).toEqual({ kind: 'free' });
  });

  test('outside_hours: no availability rows at all (picker semantics: empty rules mean never available)', () => {
    expect(walkerSlotHints('w1', NINE_AM, 30, empty, tz)).toEqual({ kind: 'outside_hours' });
  });

  test('outside_hours: rules exist but the slot falls outside them', () => {
    const d = data({
      availability: [{ user_id: 'w1', weekday: 3, start_local: '10:00', end_local: '18:00' }],
    });
    expect(walkerSlotHints('w1', NINE_AM, 30, d, tz)).toEqual({ kind: 'outside_hours' });
  });

  test('outside_hours: the DURATION pushes the slot end past the rule end', () => {
    const d = data({
      availability: [{ user_id: 'w1', weekday: 3, start_local: '08:00', end_local: '09:15' }],
    });
    // 9:00 + 30min ends 9:30 > 9:15.
    expect(walkerSlotHints('w1', NINE_AM, 30, d, tz)).toEqual({ kind: 'outside_hours' });
    // 9:00 + 15min exactly fills the rule (boundaries inclusive) -> free.
    expect(walkerSlotHints('w1', NINE_AM, 15, d, tz)).toEqual({ kind: 'free' });
  });

  test('outside_hours: only OTHER walkers have rules covering the slot', () => {
    const d = data({ availability: [wedAllDay('somebody-else')] });
    expect(walkerSlotHints('w1', NINE_AM, 30, d, tz)).toEqual({ kind: 'outside_hours' });
  });

  test('busy: an overlapping assigned visit, detail carries its local start time', () => {
    const d = data({
      availability: [wedAllDay('w1')],
      visits: [
        {
          id: 'v1',
          walker_id: 'w1',
          scheduled_start: '2026-06-10T14:15:00Z', // 9:15 AM Chicago
          scheduled_end: '2026-06-10T14:45:00Z',
        },
      ],
    });
    expect(walkerSlotHints('w1', NINE_AM, 30, d, tz)).toEqual({ kind: 'busy', detail: '9:15 AM' });
  });

  test('busy: earliest conflicting visit wins the detail', () => {
    const d = data({
      availability: [wedAllDay('w1')],
      visits: [
        {
          id: 'v2',
          walker_id: 'w1',
          scheduled_start: '2026-06-10T14:20:00Z',
          scheduled_end: '2026-06-10T14:50:00Z',
        },
        {
          id: 'v1',
          walker_id: 'w1',
          scheduled_start: '2026-06-10T14:05:00Z', // 9:05 AM, earlier
          scheduled_end: '2026-06-10T14:10:00Z',
        },
      ],
    });
    expect(walkerSlotHints('w1', NINE_AM, 30, d, tz)).toEqual({ kind: 'busy', detail: '9:05 AM' });
  });

  test('not busy: half-open overlap — a visit touching the slot boundary does not conflict', () => {
    const d = data({
      availability: [wedAllDay('w1')],
      visits: [
        {
          id: 'before',
          walker_id: 'w1',
          scheduled_start: '2026-06-10T13:30:00Z',
          scheduled_end: '2026-06-10T14:00:00Z', // ends exactly as the slot starts
        },
        {
          id: 'after',
          walker_id: 'w1',
          scheduled_start: '2026-06-10T14:30:00Z', // starts exactly as the slot ends
          scheduled_end: '2026-06-10T15:00:00Z',
        },
      ],
    });
    expect(walkerSlotHints('w1', NINE_AM, 30, d, tz)).toEqual({ kind: 'free' });
  });

  test("not busy: another walker's overlapping visit does not count", () => {
    const d = data({
      availability: [wedAllDay('w1')],
      visits: [
        {
          id: 'v1',
          walker_id: 'somebody-else',
          scheduled_start: '2026-06-10T14:00:00Z',
          scheduled_end: '2026-06-10T14:30:00Z',
        },
      ],
    });
    expect(walkerSlotHints('w1', NINE_AM, 30, d, tz)).toEqual({ kind: 'free' });
  });

  test('off: slot overlapping a time-off block', () => {
    const d = data({
      availability: [wedAllDay('w1')],
      timeOff: [
        { user_id: 'w1', starts_at: '2026-06-10T14:15:00Z', ends_at: '2026-06-10T15:00:00Z' },
      ],
    });
    expect(walkerSlotHints('w1', NINE_AM, 30, d, tz)).toEqual({ kind: 'off' });
  });

  test("off: another walker's time off does not count", () => {
    const d = data({
      availability: [wedAllDay('w1')],
      timeOff: [
        { user_id: 'somebody-else', starts_at: '2026-06-10T14:00:00Z', ends_at: '2026-06-10T15:00:00Z' },
      ],
    });
    expect(walkerSlotHints('w1', NINE_AM, 30, d, tz)).toEqual({ kind: 'free' });
  });

  test('precedence: off wins over busy wins over outside_hours', () => {
    // Everything wrong at once: time off, an overlapping visit, and no rules.
    const both = data({
      timeOff: [
        { user_id: 'w1', starts_at: '2026-06-10T14:00:00Z', ends_at: '2026-06-10T15:00:00Z' },
      ],
      visits: [
        {
          id: 'v1',
          walker_id: 'w1',
          scheduled_start: '2026-06-10T14:00:00Z',
          scheduled_end: '2026-06-10T14:30:00Z',
        },
      ],
    });
    expect(walkerSlotHints('w1', NINE_AM, 30, both, tz)).toEqual({ kind: 'off' });

    // No time off: busy beats outside_hours (still no rules).
    const busyOutside = data({ visits: both.visits });
    expect(walkerSlotHints('w1', NINE_AM, 30, busyOutside, tz)).toEqual({
      kind: 'busy',
      detail: '9:00 AM',
    });
  });

  test('tz boundary: weekday and wall time come from the business tz, not UTC', () => {
    // Wed Jun 10 2026 22:00 Chicago = Thu Jun 11 03:00Z.
    const lateWed = iso('2026-06-11T03:00:00Z');
    const wedEvening = data({
      availability: [{ user_id: 'w1', weekday: 3, start_local: '21:00', end_local: '23:00' }],
    });
    expect(walkerSlotHints('w1', lateWed, 30, wedEvening, tz)).toEqual({ kind: 'free' });
    // The SAME local hours on the UTC weekday (Thursday) do not match.
    const thuEvening = data({
      availability: [{ user_id: 'w1', weekday: 4, start_local: '21:00', end_local: '23:00' }],
    });
    expect(walkerSlotHints('w1', lateWed, 30, thuEvening, tz)).toEqual({ kind: 'outside_hours' });
  });

  test('tz boundary: busy detail is formatted in the business tz', () => {
    const lateWed = iso('2026-06-11T03:00:00Z'); // 10:00 PM Chicago Wednesday
    const d = data({
      visits: [
        {
          id: 'v1',
          walker_id: 'w1',
          scheduled_start: '2026-06-11T03:00:00Z',
          scheduled_end: '2026-06-11T03:30:00Z',
        },
      ],
    });
    expect(walkerSlotHints('w1', lateWed, 30, d, tz)).toEqual({ kind: 'busy', detail: '10:00 PM' });
  });
});

describe('slotHintLabel', () => {
  test('renders each kind compactly; free renders nothing', () => {
    expect(slotHintLabel({ kind: 'off' })).toBe('off');
    expect(slotHintLabel({ kind: 'busy', detail: '2:00 PM' })).toBe('busy 2:00 PM');
    expect(slotHintLabel({ kind: 'outside_hours' })).toBe('outside hours');
    expect(slotHintLabel({ kind: 'free' })).toBeNull();
  });
});
