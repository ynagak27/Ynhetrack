import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSaveStatements, buildImportStatements, mergeDays } from '../src/days.js';

const count = (sql) => (sql.match(/\?/g) ?? []).length;

test('a full day saves log (with drank), drinks and exercise', () => {
  const stmts = buildSaveStatements({
    date: '2026-09-27',
    timezone: 'Europe/London',
    log: { weight_kg: 87.2, sleep_hours: 7.5, note: null },
    drinks: [{ type: 'beer', count: 2 }],
    exercise: [{ kind: 'walk', minutes: 45, effort_1_5: null }],
  });
  assert.equal(stmts.length, 5);
  assert.match(stmts[0].sql, /^INSERT INTO daily_log \(date, weight_kg, sleep_hours, note, drank, timezone, updated_at\)/);
  assert.match(stmts[0].sql, /timezone = excluded.timezone/);
  assert.deepEqual(stmts[0].params, ['2026-09-27', 87.2, 7.5, null, 1, 'Europe/London']);
  assert.equal(stmts[1].sql, 'DELETE FROM drinks WHERE date = ?');
  assert.deepEqual(stmts[2].params, ['2026-09-27', 'beer', 2, 'Europe/London']);
  assert.equal(stmts[3].sql, 'DELETE FROM exercise WHERE date = ?');
  assert.deepEqual(stmts[4].params, ['2026-09-27', 'walk', 45, null, 'Europe/London']);
  for (const s of stmts) assert.equal(count(s.sql), s.params.length);
});

test('"no drinks" records drank = 0 without touching the log or its timezone', () => {
  const stmts = buildSaveStatements({ date: '2026-09-26', timezone: 'Asia/Tokyo', drinks: [] });
  assert.equal(stmts.length, 2);
  assert.match(stmts[0].sql, /INSERT INTO daily_log \(date, drank, timezone, updated_at\)/);
  assert.match(stmts[0].sql, /DO UPDATE SET drank = excluded.drank, updated_at/);
  assert.doesNotMatch(stmts[0].sql, /timezone = excluded/);
  assert.deepEqual(stmts[0].params, ['2026-09-26', 0, 'Asia/Tokyo']);
  assert.equal(stmts[1].sql, 'DELETE FROM drinks WHERE date = ?');
});

test('clearing the drinks answer updates only existing rows', () => {
  const stmts = buildSaveStatements({ date: '2026-09-26', timezone: 'Asia/Tokyo', drinks: null });
  assert.match(stmts[0].sql, /^UPDATE daily_log SET drank = NULL/);
  assert.equal(stmts[1].sql, 'DELETE FROM drinks WHERE date = ?');
  assert.equal(stmts.length, 2);
});

test('empty exercise list clears sessions; absent sections are untouched', () => {
  const stmts = buildSaveStatements({ date: '2026-09-27', timezone: 'Europe/London', exercise: [] });
  assert.deepEqual(stmts, [{ sql: 'DELETE FROM exercise WHERE date = ?', params: ['2026-09-27'] }]);
});

test('import statements chunk rows to stay under the D1 parameter limit and never overwrite weights', () => {
  const rows = Array.from({ length: 65 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, weight_kg: 88 }));
  const stmts = buildImportStatements(rows, 'Europe/London');
  assert.equal(stmts.length, 3);
  assert.equal(stmts[0].params.length, 90);
  assert.equal(stmts[2].params.length, 15);
  for (const s of stmts) {
    assert.equal(count(s.sql), s.params.length);
    assert.ok(s.params.length <= 100);
    assert.match(s.sql, /WHERE daily_log.weight_kg IS NULL$/);
  }
});

test('mergeDays groups rows by date, sorted, with empty defaults', () => {
  const days = mergeDays(
    [{ date: '2026-09-27', weight_kg: 87.2, sleep_hours: 7, note: null, drank: 0, timezone: 'Europe/London' }],
    [{ date: '2026-09-26', type: 'beer', count: 2, timezone: 'Europe/London' }],
    [{ id: 4, date: '2026-09-27', kind: 'walk', minutes: 45, effort_1_5: 3, timezone: 'Europe/London' }],
  );
  assert.deepEqual(days, [
    {
      date: '2026-09-26',
      weight_kg: null,
      sleep_hours: null,
      note: null,
      drank: null,
      timezone: 'Europe/London',
      drinks: [{ type: 'beer', count: 2 }],
      exercise: [],
    },
    {
      date: '2026-09-27',
      weight_kg: 87.2,
      sleep_hours: 7,
      note: null,
      drank: 0,
      timezone: 'Europe/London',
      drinks: [],
      exercise: [{ id: 4, kind: 'walk', minutes: 45, effort_1_5: 3 }],
    },
  ]);
});
