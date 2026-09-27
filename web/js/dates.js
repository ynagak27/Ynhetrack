// Date helpers for the phone app. "Today" is always the phone's local date.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The phone's local date as YYYY-MM-DD. */
export function localDate(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The phone's IANA timezone, e.g. Europe/London. */
export function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function parts(date) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, weekday };
}

/** "Sat 26 Sep" */
export function shortLabel(date) {
  const { m, d, weekday } = parts(date);
  return `${DAY_NAMES[weekday]} ${d} ${MONTH_NAMES[m - 1]}`;
}

/** "Today", "Yesterday" or "Sat 26 Sep". */
export function relativeLabel(date, today) {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return shortLabel(date);
}

/**
 * Which evening the drinks section starts on. When logging today before 15:00 it is
 * last night; later in the day, or when back-filling a past date, it is that day's evening.
 */
export function defaultDrinksEvening(viewDate, today, now = new Date()) {
  if (viewDate === today && now.getHours() < 15) return 'previous';
  return 'same';
}
