// Validation and normalisation of request bodies. Pure functions, no D1 access.

import { isValidDate } from './dates.js';

export const DRINK_TYPES = ['beer', 'wine', 'sake', 'spirits', 'other'];
export const EXERCISE_KINDS = ['strength_a', 'strength_b', 'walk', 'jog', 'bike', 'other'];
export const MAX_DAYS_PER_SAVE = 7;
export const MAX_SESSIONS_PER_DAY = 10;
export const NOTE_MAX = 200;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const TZ_RE = /^[A-Za-z0-9_+\-/]{1,64}$/;

export function validateTimezone(tz) {
  if (typeof tz !== 'string' || !TZ_RE.test(tz)) {
    throw new ValidationError('timezone must be an IANA name such as Europe/London');
  }
  return tz;
}

/** Round to one decimal place, avoiding float noise like 87.30000000000001. */
export function round1(n) {
  return Math.round(n * 10) / 10;
}

function optionalNumber(value, name, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new ValidationError(`${name} must be a number`);
  if (n < min || n > max) throw new ValidationError(`${name} must be between ${min} and ${max}`);
  return round1(n);
}

function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be a whole number between ${min} and ${max}`);
  }
  return value;
}

function validateNote(value) {
  let note = value ?? null;
  if (note !== null) {
    if (typeof note !== 'string') throw new ValidationError('note must be text');
    note = note.replace(/\s+/g, ' ').trim();
    if (note.length > NOTE_MAX) throw new ValidationError(`note must be at most ${NOTE_MAX} characters`);
    if (note === '') note = null;
  }
  return note;
}

/**
 * Log fields for one day. Only the fields that are present are returned (and saved);
 * fields left out keep their stored value. Present-but-empty values clear the field.
 */
export function validateLog(log) {
  if (log === null || typeof log !== 'object' || Array.isArray(log)) {
    throw new ValidationError('log must be an object');
  }
  const out = {};
  if ('weight_kg' in log) out.weight_kg = optionalNumber(log.weight_kg, 'weight_kg', 30, 300);
  if ('sleep_hours' in log) out.sleep_hours = optionalNumber(log.sleep_hours, 'sleep_hours', 0, 24);
  if ('note' in log) out.note = validateNote(log.note);
  return out;
}

/**
 * Drinks section: null = "not answered", [] = "no drinks", [{type, count}] = drinks.
 * Duplicate types are merged by summing their counts; zero counts are dropped.
 */
export function validateDrinks(drinks) {
  if (drinks === null) return null;
  if (!Array.isArray(drinks)) throw new ValidationError('drinks must be a list or null');
  const totals = new Map();
  for (const d of drinks) {
    if (!d || !DRINK_TYPES.includes(d.type)) {
      throw new ValidationError(`drink type must be one of ${DRINK_TYPES.join(', ')}`);
    }
    const count = integer(d.count, 'drink count', 0, 50);
    totals.set(d.type, (totals.get(d.type) ?? 0) + count);
  }
  const out = [];
  for (const type of DRINK_TYPES) {
    const count = totals.get(type) ?? 0;
    if (count > 50) throw new ValidationError('drink count must be at most 50 per type');
    if (count > 0) out.push({ type, count });
  }
  return out;
}

/** Exercise section: null = "not answered", [] = "no exercise", [{kind, minutes, effort_1_5}] = sessions. */
export function validateExercise(sessions) {
  if (sessions === null) return null;
  if (!Array.isArray(sessions)) throw new ValidationError('exercise must be a list or null');
  if (sessions.length > MAX_SESSIONS_PER_DAY) {
    throw new ValidationError(`at most ${MAX_SESSIONS_PER_DAY} exercise sessions per day`);
  }
  return sessions.map((s) => {
    if (!s || !EXERCISE_KINDS.includes(s.kind)) {
      throw new ValidationError(`exercise kind must be one of ${EXERCISE_KINDS.join(', ')}`);
    }
    const effort = s.effort_1_5 ?? null;
    return {
      kind: s.kind,
      minutes: integer(s.minutes, 'minutes', 1, 600),
      effort_1_5: effort === null ? null : integer(effort, 'effort_1_5', 1, 5),
    };
  });
}

/**
 * Validate one day's update. Sections that are absent (undefined) are left untouched
 * when saved; sections that are present replace what is stored for that date.
 */
export function validateDay(day, fallbackTimezone) {
  if (day === null || typeof day !== 'object' || Array.isArray(day)) {
    throw new ValidationError('each day must be an object');
  }
  if (!isValidDate(day.date)) throw new ValidationError('date must be a real date in YYYY-MM-DD form');
  const out = {
    date: day.date,
    timezone: validateTimezone(day.timezone ?? fallbackTimezone),
  };
  if (day.log !== undefined) out.log = validateLog(day.log);
  if (day.drinks !== undefined) out.drinks = validateDrinks(day.drinks);
  if (day.exercise !== undefined) out.exercise = validateExercise(day.exercise);
  if (out.log === undefined && out.drinks === undefined && out.exercise === undefined) {
    throw new ValidationError(`nothing to save for ${day.date}`);
  }
  return out;
}

/** Validate a save request: { timezone, days: [ ... ] }. Dates must be unique. */
export function validateSaveRequest(body) {
  if (body === null || typeof body !== 'object' || !Array.isArray(body.days)) {
    throw new ValidationError('body must be { timezone, days: [...] }');
  }
  if (body.days.length === 0) throw new ValidationError('days must not be empty');
  if (body.days.length > MAX_DAYS_PER_SAVE) {
    throw new ValidationError(`at most ${MAX_DAYS_PER_SAVE} days per save`);
  }
  const days = body.days.map((d) => validateDay(d, body.timezone));
  const seen = new Set();
  for (const d of days) {
    if (seen.has(d.date)) throw new ValidationError(`date ${d.date} appears twice`);
    seen.add(d.date);
  }
  return days;
}
