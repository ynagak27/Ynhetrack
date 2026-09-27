// Ynhetrack Worker: JSON API for the phone app, backed by D1.

import { HttpError, json, allowedOrigin, withCors, preflight, requireAuth } from './http.js';
import { ValidationError, validateSaveRequest, validateTimezone } from './validate.js';
import { isValidDate, daysBetween } from './dates.js';
import { buildSaveStatements, buildImportStatements, mergeDays } from './days.js';
import { parseWeightCsv, buildExportCsv, MAX_IMPORT_ROWS } from './csv.js';

const MAX_RANGE_DAYS = 400;
const MAX_IMPORT_BYTES = 256 * 1024;

function bindAll(db, stmts) {
  return stmts.map((s) => db.prepare(s.sql).bind(...s.params));
}

/** Read days in [from, to] (inclusive), or everything when no range is given. */
async function readDays(db, from, to) {
  const where = from ? ' WHERE date BETWEEN ?1 AND ?2' : '';
  const params = from ? [from, to] : [];
  const [logs, drinks, exercise] = await db.batch([
    db.prepare(`SELECT date, weight_kg, sleep_hours, note, drank, timezone FROM daily_log${where}`).bind(...params),
    db.prepare(`SELECT date, type, count, timezone FROM drinks${where} ORDER BY date, id`).bind(...params),
    db.prepare(`SELECT id, date, kind, minutes, effort_1_5, timezone FROM exercise${where} ORDER BY date, id`).bind(...params),
  ]);
  return mergeDays(logs.results, drinks.results, exercise.results);
}

function emptyDay(date) {
  return { date, weight_kg: null, sleep_hours: null, note: null, drank: null, timezone: null, drinks: [], exercise: [] };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ValidationError('body must be valid JSON');
  }
}

async function saveDays(env, body) {
  const days = validateSaveRequest(body);
  const stmts = days.flatMap(buildSaveStatements);
  await env.DB.batch(bindAll(env.DB, stmts)); // one batch = one transaction
  const dates = days.map((d) => d.date).sort();
  const saved = await readDays(env.DB, dates[0], dates[dates.length - 1]);
  return dates.map((d) => saved.find((s) => s.date === d) ?? emptyDay(d));
}

async function importWeights(request, env, url) {
  const timezone = validateTimezone(url.searchParams.get('tz') ?? '');
  const text = await request.text();
  if (text.length > MAX_IMPORT_BYTES) throw new ValidationError('file too large; split it into smaller parts');
  const { rows, errors } = parseWeightCsv(text);
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ValidationError(`at most ${MAX_IMPORT_ROWS} rows per upload; split the file`);
  }
  let imported = 0;
  if (rows.length > 0) {
    const results = await env.DB.batch(bindAll(env.DB, buildImportStatements(rows, timezone)));
    imported = results.reduce((sum, r) => sum + (r.meta?.changes ?? 0), 0);
  }
  return json({ imported, skipped: rows.length - imported, errors: errors.slice(0, 50), error_count: errors.length });
}

async function route(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/health' && method === 'GET') return json({ ok: true });

  await requireAuth(request, env);

  if (pathname === '/api/days' && method === 'GET') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!isValidDate(from) || !isValidDate(to)) throw new ValidationError('from and to must be dates (YYYY-MM-DD)');
    const span = daysBetween(from, to);
    if (span < 0 || span > MAX_RANGE_DAYS) throw new ValidationError(`range must be 0–${MAX_RANGE_DAYS} days`);
    return json({ days: await readDays(env.DB, from, to) });
  }

  if (pathname === '/api/days' && method === 'PUT') return json({ days: await saveDays(env, await readJson(request)) });

  const dayMatch = /^\/api\/days\/(\d{4}-\d{2}-\d{2})$/.exec(pathname);
  if (dayMatch) {
    const date = dayMatch[1];
    if (!isValidDate(date)) throw new ValidationError('not a real date');
    if (method === 'GET') {
      const [day] = await readDays(env.DB, date, date);
      return json(day ?? emptyDay(date));
    }
    if (method === 'PUT') {
      const body = await readJson(request);
      if (body === null || typeof body !== 'object') throw new ValidationError('body must be an object');
      const { timezone, ...rest } = body;
      const [saved] = await saveDays(env, { timezone, days: [{ ...rest, date }] });
      return json(saved);
    }
  }

  if (pathname === '/api/import/weights' && method === 'POST') return importWeights(request, env, url);

  if (pathname === '/api/export.csv' && method === 'GET') {
    const csv = buildExportCsv(await readDays(env.DB));
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ynhetrack-export-${stamp}.csv"`,
      },
    });
  }

  if (pathname === '/api/settings' && method === 'GET') {
    const row = await env.DB.prepare('SELECT target_lifts, target_walks, target_bike FROM settings WHERE id = 1').first();
    return json(row ?? { target_lifts: 3, target_walks: 3, target_bike: 2 });
  }

  throw new HttpError(404, 'not found');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    if (request.method === 'OPTIONS') return preflight(origin);
    let response;
    try {
      response = await route(request, env, url);
    } catch (err) {
      if (err instanceof ValidationError) response = json({ error: err.message }, 400);
      else if (err instanceof HttpError) response = json({ error: err.message }, err.status);
      else {
        console.error(err);
        response = json({ error: 'internal error' }, 500);
      }
    }
    response.headers.set('Cache-Control', 'no-store');
    return withCors(response, origin);
  },
};
