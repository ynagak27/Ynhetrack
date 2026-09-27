import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWeightCsv, parseDate, parseWeight, detectDayFirst, splitCsvLine, buildExportCsv } from '../src/csv.js';

test('splitCsvLine honours quotes', () => {
  assert.deepEqual(splitCsvLine('2026-09-01,"87,2"', ','), ['2026-09-01', '87,2']);
  assert.deepEqual(splitCsvLine('a,"say ""hi""",c', ','), ['a', 'say "hi"', 'c']);
});

test('parseDate handles ISO, slashes, day-first, month-first and time suffixes', () => {
  assert.equal(parseDate('2026-09-01'), '2026-09-01');
  assert.equal(parseDate('2026/9/1'), '2026-09-01');
  assert.equal(parseDate('2026-09-01T07:30:00Z'), '2026-09-01');
  assert.equal(parseDate('01/09/2026 07:30'), '2026-09-01');
  assert.equal(parseDate('1.9.2026'), '2026-09-01');
  assert.equal(parseDate('09/01/2026', false), '2026-09-01');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('Sep 1 2026'), null);
});

test('detectDayFirst defaults to day-first and only switches on clear evidence', () => {
  assert.equal(detectDayFirst(['01/09/2026', '02/09/2026']), true);
  assert.equal(detectDayFirst(['25/09/2026']), true);
  assert.equal(detectDayFirst(['09/25/2026', '09/01/2026']), false);
  assert.equal(detectDayFirst(['25/09/2026', '09/25/2026']), null);
  assert.equal(detectDayFirst(['2026-09-25']), true);
});

test('parseWeight accepts decimal commas and a kg suffix, rejects nonsense', () => {
  assert.equal(parseWeight('87.2'), 87.2);
  assert.equal(parseWeight('87,25'), 87.3);
  assert.equal(parseWeight(' 88 kg'), 88);
  assert.equal(parseWeight('abc'), null);
  assert.equal(parseWeight('8'), null);
  assert.equal(parseWeight('-87'), null);
});

test('parseWeightCsv with header, BOM, CRLF and blank lines', () => {
  const text = '﻿date,weight_kg\r\n2026-09-01,87.2\r\n\r\n2026-09-02,86.9\r\n';
  assert.deepEqual(parseWeightCsv(text), {
    rows: [
      { date: '2026-09-01', weight_kg: 87.2 },
      { date: '2026-09-02', weight_kg: 86.9 },
    ],
    errors: [],
  });
});

test('parseWeightCsv without header, semicolons and decimal commas', () => {
  const { rows, errors } = parseWeightCsv('01/09/2026;87,2\n25/09/2026;85,6');
  assert.deepEqual(rows, [
    { date: '2026-09-01', weight_kg: 87.2 },
    { date: '2026-09-25', weight_kg: 85.6 },
  ]);
  assert.deepEqual(errors, []);
});

test('parseWeightCsv finds columns by header name', () => {
  const { rows } = parseWeightCsv('Weight (kg),Date,Note\n87.2,2026-09-01,morning\n');
  assert.deepEqual(rows, [{ date: '2026-09-01', weight_kg: 87.2 }]);
});

test('parseWeightCsv reports bad rows and duplicates by line number', () => {
  const { rows, errors } = parseWeightCsv('date,weight\n2026-09-01,87.2\nyesterday,87\n2026-09-02,heavy\n2026-09-01,90\n');
  assert.deepEqual(rows, [{ date: '2026-09-01', weight_kg: 87.2 }]);
  assert.deepEqual(
    errors.map((e) => e.line),
    [3, 4, 5],
  );
  assert.match(errors[2].message, /duplicate/);
});

test('parseWeightCsv refuses files that mix day-first and month-first dates', () => {
  const { rows, errors } = parseWeightCsv('25/09/2026,87\n09/26/2026,86\n');
  assert.equal(rows.length, 0);
  assert.equal(errors.length, 1);
});

test('buildExportCsv writes one row per day with drinks by type and encoded sessions', () => {
  const csv = buildExportCsv([
    {
      date: '2026-09-26',
      weight_kg: 87.2,
      sleep_hours: 7.5,
      note: 'ate out, "big" meal',
      drank: 1,
      timezone: 'Europe/London',
      drinks: [
        { type: 'beer', count: 2 },
        { type: 'wine', count: 1 },
      ],
      exercise: [
        { kind: 'walk', minutes: 45, effort_1_5: 3 },
        { kind: 'strength_a', minutes: 60, effort_1_5: null },
      ],
    },
    {
      date: '2026-09-27',
      weight_kg: null,
      sleep_hours: null,
      note: null,
      drank: null,
      timezone: 'Asia/Tokyo',
      drinks: [],
      exercise: [],
    },
  ]);
  const lines = csv.split('\r\n');
  assert.equal(
    lines[0],
    'date,weight_kg,sleep_hours,drank,drinks_beer,drinks_wine,drinks_sake,drinks_spirits,drinks_other,drinks_total,exercise,exercise_minutes,note,timezone',
  );
  assert.equal(lines[1], '2026-09-26,87.2,7.5,yes,2,1,0,0,0,3,walk:45:3;strength_a:60,105,"ate out, ""big"" meal",Europe/London');
  assert.equal(lines[2], '2026-09-27,,,,0,0,0,0,0,0,,0,,Asia/Tokyo');
  assert.equal(lines[3], '');
});
