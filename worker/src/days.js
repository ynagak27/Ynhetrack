// SQL statement building and row merging for days. Pure functions: statements are
// returned as { sql, params } so they can be tested without a database.

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";

// D1 allows at most 100 bound parameters per statement.
const IMPORT_ROWS_PER_STATEMENT = 30;

function placeholders(rowCount, perRow) {
  const one = `(${Array(perRow).fill('?').join(', ')})`;
  return Array(rowCount).fill(one).join(', ');
}

/** Statements that save one validated day (see validateDay). */
export function buildSaveStatements(day) {
  const { date, timezone } = day;
  const stmts = [];

  // daily_log columns to write: the log section, plus `drank` when drinks were sent.
  const cols = {};
  if (day.log) Object.assign(cols, day.log);
  if (day.drinks !== undefined) cols.drank = day.drinks === null ? null : day.drinks.length > 0 ? 1 : 0;

  const names = Object.keys(cols);
  if (names.length === 1 && names[0] === 'drank' && cols.drank === null) {
    // Clearing the drinks answer must not create an empty day.
    stmts.push({ sql: `UPDATE daily_log SET drank = NULL, updated_at = ${NOW} WHERE date = ?`, params: [date] });
  } else if (names.length > 0) {
    // Only a log section changes the day's timezone; a drinks-only save keeps it.
    const updates = names.map((n) => `${n} = excluded.${n}`);
    if (day.log) updates.push('timezone = excluded.timezone');
    updates.push('updated_at = excluded.updated_at');
    stmts.push({
      sql:
        `INSERT INTO daily_log (date, ${names.join(', ')}, timezone, updated_at) ` +
        `VALUES (?, ${names.map(() => '?').join(', ')}, ?, ${NOW}) ` +
        `ON CONFLICT (date) DO UPDATE SET ${updates.join(', ')}`,
      params: [date, ...names.map((n) => cols[n]), timezone],
    });
  }

  if (day.drinks !== undefined) {
    stmts.push({ sql: 'DELETE FROM drinks WHERE date = ?', params: [date] });
    if (day.drinks && day.drinks.length > 0) {
      stmts.push({
        sql: `INSERT INTO drinks (date, type, count, timezone) VALUES ${placeholders(day.drinks.length, 4)}`,
        params: day.drinks.flatMap((d) => [date, d.type, d.count, timezone]),
      });
    }
  }

  if (day.exercise !== undefined) {
    stmts.push({ sql: 'DELETE FROM exercise WHERE date = ?', params: [date] });
    if (day.exercise.length > 0) {
      stmts.push({
        sql: `INSERT INTO exercise (date, kind, minutes, effort_1_5, timezone) VALUES ${placeholders(day.exercise.length, 5)}`,
        params: day.exercise.flatMap((e) => [date, e.kind, e.minutes, e.effort_1_5, timezone]),
      });
    }
  }
  return stmts;
}

/**
 * Statements that import past weights. A date that already has a weight is left alone;
 * a date with a day row but no weight gets the imported weight.
 */
export function buildImportStatements(rows, timezone) {
  const stmts = [];
  for (let i = 0; i < rows.length; i += IMPORT_ROWS_PER_STATEMENT) {
    const chunk = rows.slice(i, i + IMPORT_ROWS_PER_STATEMENT);
    stmts.push({
      sql:
        `INSERT INTO daily_log (date, weight_kg, timezone) VALUES ${placeholders(chunk.length, 3)} ` +
        'ON CONFLICT (date) DO UPDATE SET weight_kg = excluded.weight_kg WHERE daily_log.weight_kg IS NULL',
      params: chunk.flatMap((r) => [r.date, r.weight_kg, timezone]),
    });
  }
  return stmts;
}

/** Combine daily_log, drinks and exercise rows into one object per date, sorted by date. */
export function mergeDays(logs, drinks, exercise) {
  const days = new Map();
  const get = (date) => {
    if (!days.has(date)) {
      days.set(date, {
        date,
        weight_kg: null,
        sleep_hours: null,
        note: null,
        drank: null,
        timezone: null,
        drinks: [],
        exercise: [],
      });
    }
    return days.get(date);
  };
  for (const l of logs) {
    Object.assign(get(l.date), {
      weight_kg: l.weight_kg,
      sleep_hours: l.sleep_hours,
      note: l.note,
      drank: l.drank,
      timezone: l.timezone,
    });
  }
  for (const d of drinks) {
    const day = get(d.date);
    day.drinks.push({ type: d.type, count: d.count });
    day.timezone ??= d.timezone;
  }
  for (const e of exercise) {
    const day = get(e.date);
    day.exercise.push({ id: e.id, kind: e.kind, minutes: e.minutes, effort_1_5: e.effort_1_5 });
    day.timezone ??= e.timezone;
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
