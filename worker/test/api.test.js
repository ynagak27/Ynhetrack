// End-to-end tests of the Worker's fetch handler against an in-memory SQLite "D1"
// that runs the real migration.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createFakeD1 } from './fake-d1.js';

const TOKEN = 'test-token-0123456789abcdef';
const ORIGIN = 'https://ynagak27.github.io';
let env;

beforeEach(() => {
  env = { DB: createFakeD1(), API_TOKEN: TOKEN, ALLOWED_ORIGINS: `${ORIGIN},http://localhost:8000` };
});

function call(method, path, { body, token = TOKEN, origin = ORIGIN, raw } = {}) {
  const headers = { Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return worker.fetch(
    new Request(`https://api.example.test${path}`, {
      method,
      headers,
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    }),
    env,
  );
}

test('health needs no token; everything else does', async () => {
  assert.equal((await call('GET', '/api/health', { token: null })).status, 200);
  assert.equal((await call('GET', '/api/days/2026-09-27', { token: null })).status, 401);
  assert.equal((await call('GET', '/api/days/2026-09-27', { token: 'wrong-token-wrong-token' })).status, 401);
  assert.equal((await call('GET', '/api/days/2026-09-27')).status, 200);
});

test('a missing API_TOKEN secret fails closed', async () => {
  delete env.API_TOKEN;
  const res = await call('GET', '/api/days/2026-09-27');
  assert.equal(res.status, 500);
});

test('CORS: allowed origin gets headers, others do not; preflight works', async () => {
  const ok = await call('GET', '/api/health');
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const other = await call('GET', '/api/health', { origin: 'https://evil.example' });
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  const pre = await worker.fetch(
    new Request('https://api.example.test/api/days/2026-09-27', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
    env,
  );
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

test('an unlogged day comes back empty', async () => {
  const day = await (await call('GET', '/api/days/2026-09-27')).json();
  assert.deepEqual(day, {
    date: '2026-09-27',
    weight_kg: null,
    sleep_hours: null,
    note: null,
    drank: null,
    timezone: null,
    drinks: [],
    exercise: [],
  });
});

test('morning save: today plus last night\'s drinks in one request, then edit', async () => {
  const res = await call('PUT', '/api/days', {
    body: {
      timezone: 'Europe/London',
      days: [
        {
          date: '2026-09-27',
          log: { weight_kg: 87.24, sleep_hours: 7.5, note: 'slept badly' },
          exercise: [{ kind: 'walk', minutes: 45, effort_1_5: 3 }],
        },
        { date: '2026-09-26', drinks: [{ type: 'beer', count: 2 }, { type: 'wine', count: 1 }] },
      ],
    },
  });
  assert.equal(res.status, 200);
  const { days } = await res.json();
  assert.deepEqual(
    days.map((d) => d.date),
    ['2026-09-26', '2026-09-27'],
  );

  const range = await (await call('GET', '/api/days?from=2026-09-26&to=2026-09-27')).json();
  const [sat, sun] = range.days;
  assert.equal(sat.drank, 1);
  assert.equal(sat.weight_kg, null);
  assert.deepEqual(sat.drinks, [
    { type: 'beer', count: 2 },
    { type: 'wine', count: 1 },
  ]);
  assert.equal(sun.weight_kg, 87.2);
  assert.equal(sun.drank, null);
  assert.equal(sun.exercise.length, 1);
  assert.equal(sun.timezone, 'Europe/London');

  // Later that day: add a lift from Tokyo. Weight/drinks untouched since only exercise is sent.
  await call('PUT', '/api/days/2026-09-27', {
    body: {
      timezone: 'Asia/Tokyo',
      exercise: [
        { kind: 'walk', minutes: 45, effort_1_5: 3 },
        { kind: 'strength_a', minutes: 60 },
      ],
    },
  });
  const sun2 = await (await call('GET', '/api/days/2026-09-27')).json();
  assert.equal(sun2.weight_kg, 87.2);
  assert.equal(sun2.timezone, 'Europe/London'); // day timezone only changes with the log section
  assert.deepEqual(
    sun2.exercise.map((e) => e.kind),
    ['walk', 'strength_a'],
  );

  // Changing last night's answer to "no drinks" removes the drink rows.
  await call('PUT', '/api/days/2026-09-26', { body: { timezone: 'Europe/London', drinks: [] } });
  const sat2 = await (await call('GET', '/api/days/2026-09-26')).json();
  assert.equal(sat2.drank, 0);
  assert.deepEqual(sat2.drinks, []);
});

test('invalid input is rejected with 400 and nothing is written', async () => {
  const res = await call('PUT', '/api/days', {
    body: {
      timezone: 'Europe/London',
      days: [
        { date: '2026-09-27', log: { weight_kg: 87 } },
        { date: '2026-09-26', exercise: [{ kind: 'yoga', minutes: 30 }] },
      ],
    },
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /exercise kind/);
  assert.equal((await (await call('GET', '/api/days/2026-09-27')).json()).weight_kg, null);
  assert.equal((await call('PUT', '/api/days/2026-09-27', { raw: '{not json' })).status, 400);
  assert.equal((await call('GET', '/api/days/2026-02-30')).status, 400);
  assert.equal((await call('GET', '/api/days?from=2026-09-27&to=2026-09-01')).status, 400);
  assert.equal((await call('GET', '/api/nope')).status, 404);
});

test('CSV import fills missing weights, skips existing ones, reports errors', async () => {
  await call('PUT', '/api/days/2026-09-02', { body: { timezone: 'Europe/London', log: { weight_kg: 86.0 } } });
  await call('PUT', '/api/days/2026-09-03', { body: { timezone: 'Europe/London', drinks: [] } }); // row, no weight
  const csv = 'date,weight_kg\n2026-09-01,87.2\n2026-09-02,99.9\n2026-09-03,86.5\nbad,1\n';
  const res = await call('POST', '/api/import/weights?tz=Europe/London', { raw: csv });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.imported, 2);
  assert.equal(out.skipped, 1);
  assert.equal(out.error_count, 1);
  const { days } = await (await call('GET', '/api/days?from=2026-09-01&to=2026-09-03')).json();
  assert.deepEqual(
    days.map((d) => d.weight_kg),
    [87.2, 86.0, 86.5],
  );
  assert.equal(days[2].drank, 0);
  assert.equal((await call('POST', '/api/import/weights', { raw: csv })).status, 400); // tz required
});

test('export returns every day as CSV', async () => {
  await call('PUT', '/api/days', {
    body: {
      timezone: 'Asia/Tokyo',
      days: [
        { date: '2026-09-27', log: { weight_kg: 87.2, note: 'ate out' }, exercise: [{ kind: 'bike', minutes: 30 }] },
        { date: '2026-09-26', drinks: [{ type: 'sake', count: 2 }] },
      ],
    },
  });
  const res = await call('GET', '/api/export.csv');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /text\/csv/);
  assert.match(res.headers.get('Content-Disposition'), /ynhetrack-export-\d{4}-\d{2}-\d{2}\.csv/);
  const lines = (await res.text()).trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '2026-09-26,,,yes,0,0,2,0,0,2,,0,,Asia/Tokyo');
  assert.equal(lines[2], '2026-09-27,87.2,,,0,0,0,0,0,0,bike:30,30,ate out,Asia/Tokyo');
});

test('settings returns the weekly exercise targets', async () => {
  assert.deepEqual(await (await call('GET', '/api/settings')).json(), { target_lifts: 3, target_walks: 3, target_bike: 2 });
});
