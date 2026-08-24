/**
 * Pure wall-clock conversions between the form's string values
 * ('YYYY-MM-DD' / 'HH:MM') and the Date objects the native pickers consume.
 *
 * The Dates built here carry LOCAL wall-clock fields only and exist purely to
 * feed/read the picker widgets — never convert through UTC here. The business
 * time-zone conversion downstream (visitInstants / createSeries) stays the
 * single source of truth for stored instants.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local wall-clock fields of `date` as 'YYYY-MM-DD'. */
export function dateToYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Wall-clock Date for the picker widget: new Date(y, m-1, d) with local fields. */
export function ymdToDate(ymd: string): Date {
  const [y = 0, m = 1, d = 1] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DD' → 'Mon, Aug 24 2026'. */
export function ymdToDisplay(ymd: string): string {
  const d = ymdToDate(ymd);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}

/** Wall-clock Date carrying the given 'HH:MM' for the time picker widget. */
export function hhmmToDate(hhmm: string): Date {
  const [h = 0, mi = 0] = hhmm.split(':').map(Number);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
}

/** Local wall-clock time of `date` as 'HH:MM'. */
export function dateToHhmm(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 'HH:MM' → '9:00 AM'. */
export function hhmmToDisplay(hhmm: string): string {
  const [h = 0, mi = 0] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(mi)} ${suffix}`;
}

/** The next full hour after `now`, as 'HH:MM' (wraps to '00:00' after 23:xx). */
export function roundToNextHour(now: Date): string {
  return `${pad2((now.getHours() + 1) % 24)}:00`;
}
