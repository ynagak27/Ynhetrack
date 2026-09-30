import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLog,
  validateDrinks,
  validateExercise,
  validateDay,
  validateSaveRequest,
  ValidationError,
  round1,
} from '../src/validate.js';

test('round1 removes float noise', () => {
  assert.equal(round1(87.30000000000001), 87.3);
  assert.equal(round1(87.25), 87.3);
  assert.equal(round1(7.44), 7.4);
});

test('validateLog normalises weight, sleep and note', () => {
  assert.deepEqual(validateLog({ weight_kg: 87.24, sleep_hours: '7,5', note: '  ate   out ' }), {
    weight_kg: 87.2,
    sleep_hours: 7.5,
    note: 'ate out',
  });
  assert.deepEqual(validateLog({ weight_kg: '', note: '   ' }), { weight_kg: null, note: null });
});

test('validateLog returns only the fields that were sent', () => {
  assert.deepEqual(validateLog({}), {});
  assert.deepEqual(validateLog({ note: 'ate out' }), { note: 'ate out' });
  assert.deepEqual(validateLog({ weight_kg: 86.8, sleep_hours: null }), { weight_kg: 86.8, sleep_hours: null });
});

test('validateLog rejects out-of-range values', () => {
  assert.throws(() => validateLog({ weight_kg: 12 }), ValidationError);
  assert.throws(() => validateLog({ weight_kg: 'heavy' }), ValidationError);
  assert.throws(() => validateLog({ sleep_hours: 25 }), ValidationError);
  assert.throws(() => validateLog({ note: 'x'.repeat(201) }), ValidationError);
  assert.throws(() => validateLog([]), ValidationError);
});

test('validateDrinks: null = not answered, [] = none, duplicates merged, zeros dropped', () => {
  assert.equal(validateDrinks(null), null);
  assert.deepEqual(validateDrinks([]), []);
  assert.deepEqual(
    validateDrinks([
      { type: 'wine', count: 1 },
      { type: 'beer', count: 2 },
      { type: 'beer', count: 1 },
      { type: 'sake', count: 0 },
    ]),
    [
      { type: 'beer', count: 3 },
      { type: 'wine', count: 1 },
    ],
  );
  assert.throws(() => validateDrinks([{ type: 'cider', count: 1 }]), ValidationError);
  assert.throws(() => validateDrinks([{ type: 'beer', count: 1.5 }]), ValidationError);
  assert.throws(() => validateDrinks('beer'), ValidationError);
});

test('validateExercise checks kind, minutes and optional effort', () => {
  assert.deepEqual(validateExercise([{ kind: 'walk', minutes: 45 }, { kind: 'strength_a', minutes: 60, effort_1_5: 4 }]), [
    { kind: 'walk', minutes: 45, effort_1_5: null },
    { kind: 'strength_a', minutes: 60, effort_1_5: 4 },
  ]);
  assert.deepEqual(validateExercise([]), []);
  assert.equal(validateExercise(null), null);
  assert.throws(() => validateExercise([{ kind: 'yoga', minutes: 30 }]), ValidationError);
  assert.throws(() => validateExercise([{ kind: 'walk', minutes: 0 }]), ValidationError);
  assert.throws(() => validateExercise([{ kind: 'walk', minutes: 30, effort_1_5: 6 }]), ValidationError);
  assert.throws(() => validateExercise(Array(11).fill({ kind: 'walk', minutes: 10 })), ValidationError);
});

test('validateDay keeps only the sections that were sent', () => {
  const d = validateDay({ date: '2026-09-26', drinks: [] }, 'Europe/London');
  assert.deepEqual(d, { date: '2026-09-26', timezone: 'Europe/London', drinks: [] });
  assert.equal('log' in d, false);
  assert.equal('exercise' in d, false);
});

test('validateDay requires a real date, a timezone and something to save', () => {
  assert.throws(() => validateDay({ date: '2026-02-30', log: {} }, 'Europe/London'), ValidationError);
  assert.throws(() => validateDay({ date: '2026-09-26', log: {} }, 'Not a zone!'), ValidationError);
  assert.throws(() => validateDay({ date: '2026-09-26' }, 'Asia/Tokyo'), ValidationError);
  // a per-day timezone overrides the request-level one
  assert.equal(validateDay({ date: '2026-09-26', log: {}, timezone: 'Asia/Tokyo' }, 'Europe/London').timezone, 'Asia/Tokyo');
});

test('validateSaveRequest checks the envelope and duplicate dates', () => {
  const ok = validateSaveRequest({
    timezone: 'Europe/London',
    days: [
      { date: '2026-09-27', log: { weight_kg: 87.2 }, exercise: [] },
      { date: '2026-09-26', drinks: [{ type: 'beer', count: 2 }] },
    ],
  });
  assert.equal(ok.length, 2);
  assert.throws(() => validateSaveRequest({ days: [] }), ValidationError);
  assert.throws(() => validateSaveRequest({}), ValidationError);
  assert.throws(
    () =>
      validateSaveRequest({
        timezone: 'Europe/London',
        days: [
          { date: '2026-09-27', log: {} },
          { date: '2026-09-27', exercise: [] },
        ],
      }),
    ValidationError,
  );
  assert.throws(
    () =>
      validateSaveRequest({
        timezone: 'Europe/London',
        days: Array.from({ length: 8 }, (_, i) => ({ date: `2026-09-0${i + 1}`, log: {} })),
      }),
    ValidationError,
  );
});
