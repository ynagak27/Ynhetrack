import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDate, addDays, shortLabel, relativeLabel, defaultRecapDay } from '../js/dates.js';

test('localDate uses the local calendar date', () => {
  assert.equal(localDate(new Date(2026, 8, 27, 0, 5)), '2026-09-27');
  assert.equal(localDate(new Date(2026, 8, 27, 23, 59)), '2026-09-27');
  assert.equal(localDate(new Date(2026, 0, 3, 12)), '2026-01-03');
});

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-10-01', -1), '2026-09-30');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('labels', () => {
  assert.equal(shortLabel('2026-09-26'), 'Sat 26 Sep');
  assert.equal(relativeLabel('2026-09-27', '2026-09-27'), 'Today');
  assert.equal(relativeLabel('2026-09-26', '2026-09-27'), 'Yesterday');
  assert.equal(relativeLabel('2026-09-20', '2026-09-27'), 'Sun 20 Sep');
});

test('the recap section covers the day before, except today after 15:00', () => {
  const today = '2026-09-27';
  assert.equal(defaultRecapDay(today, today, new Date(2026, 8, 27, 7, 30)), 'previous');
  assert.equal(defaultRecapDay(today, today, new Date(2026, 8, 27, 14, 59)), 'previous');
  assert.equal(defaultRecapDay(today, today, new Date(2026, 8, 27, 15, 0)), 'same');
  // a past date is treated as that morning's entry, so it also recaps the day before
  assert.equal(defaultRecapDay('2026-09-25', today, new Date(2026, 8, 27, 20, 0)), 'previous');
});
