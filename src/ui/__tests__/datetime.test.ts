import {
  dateToHhmm,
  dateToYmd,
  hhmmToDate,
  hhmmToDisplay,
  roundToNextHour,
  ymdToDate,
  ymdToDisplay,
} from '../datetime';

describe('dateToYmd', () => {
  it('formats local wall-clock fields with zero padding', () => {
    expect(dateToYmd(new Date(2026, 7, 24))).toBe('2026-08-24');
    expect(dateToYmd(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('round-trips through ymdToDate', () => {
    expect(dateToYmd(ymdToDate('2026-12-31'))).toBe('2026-12-31');
  });
});

describe('ymdToDate', () => {
  it('constructs a local wall-clock Date, never via UTC', () => {
    const d = ymdToDate('2026-08-24');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(24);
    expect(d.getHours()).toBe(0);
  });
});

describe('ymdToDisplay', () => {
  it('renders weekday, month, day and year', () => {
    // 2026-08-24 is a Monday.
    expect(ymdToDisplay('2026-08-24')).toBe('Mon, Aug 24 2026');
    // 2026-01-01 is a Thursday.
    expect(ymdToDisplay('2026-01-01')).toBe('Thu, Jan 1 2026');
  });
});

describe('hhmmToDate / dateToHhmm', () => {
  it('puts the wall-clock time on the picker Date', () => {
    const d = hhmmToDate('09:05');
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(5);
  });

  it('round-trips and pads', () => {
    expect(dateToHhmm(hhmmToDate('00:00'))).toBe('00:00');
    expect(dateToHhmm(hhmmToDate('23:59'))).toBe('23:59');
    expect(dateToHhmm(new Date(2026, 7, 24, 7, 3))).toBe('07:03');
  });
});

describe('hhmmToDisplay', () => {
  it('formats 12-hour time with AM/PM', () => {
    expect(hhmmToDisplay('09:00')).toBe('9:00 AM');
    expect(hhmmToDisplay('00:15')).toBe('12:15 AM');
    expect(hhmmToDisplay('12:00')).toBe('12:00 PM');
    expect(hhmmToDisplay('13:05')).toBe('1:05 PM');
    expect(hhmmToDisplay('23:59')).toBe('11:59 PM');
  });
});

describe('roundToNextHour', () => {
  it('returns the next full hour as HH:MM', () => {
    expect(roundToNextHour(new Date(2026, 7, 24, 9, 12))).toBe('10:00');
    expect(roundToNextHour(new Date(2026, 7, 24, 9, 0))).toBe('10:00');
  });

  it('wraps past midnight', () => {
    expect(roundToNextHour(new Date(2026, 7, 24, 23, 40))).toBe('00:00');
  });
});
