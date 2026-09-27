import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDate, makeDate, addDays, daysBetween } from '../src/dates.js';

test('isValidDate accepts real dates and rejects impossible ones', () => {
  assert.equal(isValidDate('2026-09-27'), true);
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-9-27'), false);
  assert.equal(isValidDate('27/09/2026'), false);
  assert.equal(isValidDate(null), false);
});

test('makeDate pads and validates', () => {
  assert.equal(makeDate(2026, 9, 1), '2026-09-01');
  assert.equal(makeDate(2026, 2, 30), null);
});

test('addDays crosses month, year and DST boundaries', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30'); // UK clocks change
  assert.equal(addDays('2026-10-25', -7), '2026-10-18');
});

test('daysBetween counts whole days', () => {
  assert.equal(daysBetween('2026-09-01', '2026-09-27'), 26);
  assert.equal(daysBetween('2026-09-27', '2026-09-01'), -26);
  assert.equal(daysBetween('2025-12-31', '2026-01-01'), 1);
});
