// Local calendar dates as 'YYYY-MM-DD' strings. All arithmetic is done in UTC so it
// never depends on the Worker's own timezone.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True if `s` is a real calendar date in YYYY-MM-DD form (e.g. rejects 2026-02-30). */
export function isValidDate(s) {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Build a YYYY-MM-DD string from numbers, or null if it isn't a real date. */
export function makeDate(y, m, d) {
  const s = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidDate(s) ? s : null;
}

/** Add `n` days (may be negative) to a YYYY-MM-DD date. */
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive if `to` is later). */
export function daysBetween(from, to) {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86400000);
}
