// CSV import (past weights) and export (everything). Pure functions, no D1 access.

import { makeDate } from './dates.js';
import { DRINK_TYPES, round1 } from './validate.js';

export const MAX_IMPORT_ROWS = 1200;

/** Split one CSV line into fields, honouring double quotes ("87,2" stays one field). */
export function splitCsvLine(line, sep) {
  const fields = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function detectSeparator(line) {
  if (line.includes('\t')) return '\t';
  if (line.includes(';')) return ';';
  return ',';
}

const YMD_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const XYY_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;

/** Drop a time part: "2026-09-01T07:30:00Z" or "01/09/2026 07:30" -> the date token. */
function dateToken(raw) {
  return raw.trim().split(/[T\s]/)[0];
}

/**
 * Work out whether a file's d/m/yyyy-style dates are day-first (the default, UK style)
 * or month-first (only if some date's middle part is > 12 and none has a first part > 12).
 */
export function detectDayFirst(tokens) {
  let dayFirstEvidence = false;
  let monthFirstEvidence = false;
  for (const t of tokens) {
    const m = XYY_RE.exec(t);
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirstEvidence = true;
    if (Number(m[2]) > 12) monthFirstEvidence = true;
  }
  if (dayFirstEvidence && monthFirstEvidence) return null; // mixed: can't tell
  return !monthFirstEvidence;
}

export function parseDate(raw, dayFirst = true) {
  const t = dateToken(raw);
  let m = YMD_RE.exec(t);
  if (m) return makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = XYY_RE.exec(t);
  if (m) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return dayFirst ? makeDate(y, b, a) : makeDate(y, a, b);
  }
  return null;
}

export function parseWeight(raw) {
  const t = raw.trim().replace(/\s*kgs?$/i, '').replace(',', '.');
  if (!/^\d{1,3}(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (n < 30 || n > 300) return null;
  return round1(n);
}

/**
 * Parse a CSV of past weights (date, weight_kg). Accepts an optional header row,
 * comma/semicolon/tab separators, decimal commas and several date formats.
 * Returns { rows: [{date, weight_kg}], errors: [{line, message}] }.
 * For duplicate dates the first row wins and later ones are reported.
 */
export function parseWeightCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const records = [];
  let dateCol = 0;
  let weightCol = 1;
  let headerSeen = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    const fields = splitCsvLine(line, detectSeparator(line));
    if (!headerSeen && records.length === 0) {
      headerSeen = true;
      const lower = fields.map((f) => f.toLowerCase());
      const looksLikeHeader = lower.some((f) => /[a-z]/.test(f)) && !parseWeight(fields[1] ?? '');
      if (looksLikeHeader) {
        const d = lower.findIndex((f) => f.includes('date') || f === 'day');
        const w = lower.findIndex((f) => f.includes('weight') || f.includes('kg'));
        if (d >= 0) dateCol = d;
        if (w >= 0) weightCol = w;
        continue;
      }
    }
    records.push({ line: i + 1, dateRaw: fields[dateCol] ?? '', weightRaw: fields[weightCol] ?? '' });
  }

  const dayFirst = detectDayFirst(records.map((r) => dateToken(r.dateRaw)));
  const rows = [];
  const errors = [];
  if (dayFirst === null) {
    errors.push({ line: 0, message: 'dates mix day-first and month-first formats; please use YYYY-MM-DD' });
    return { rows, errors };
  }

  const seen = new Set();
  for (const r of records) {
    const date = parseDate(r.dateRaw, dayFirst);
    if (!date) {
      errors.push({ line: r.line, message: `unrecognised date "${r.dateRaw}"` });
      continue;
    }
    const weight = parseWeight(r.weightRaw);
    if (weight === null) {
      errors.push({ line: r.line, message: `weight "${r.weightRaw}" is not a number between 30 and 300 kg` });
      continue;
    }
    if (seen.has(date)) {
      errors.push({ line: r.line, message: `duplicate date ${date}; kept the first one` });
      continue;
    }
    seen.add(date);
    rows.push({ date, weight_kg: weight });
  }
  return { rows, errors };
}

function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const EXPORT_COLUMNS = [
  'date',
  'weight_kg',
  'sleep_hours',
  'drank',
  ...DRINK_TYPES.map((t) => `drinks_${t}`),
  'drinks_total',
  'exercise',
  'exercise_minutes',
  'note',
  'timezone',
];

/**
 * One row per date. `exercise` lists sessions as kind:minutes[:effort] joined by ';'
 * (e.g. "walk:45:3;strength_a:60"). `drank` is yes / no / blank (not answered).
 */
export function buildExportCsv(days) {
  const out = [EXPORT_COLUMNS.join(',')];
  for (const d of days) {
    const byType = Object.fromEntries(d.drinks.map((x) => [x.type, x.count]));
    const total = d.drinks.reduce((s, x) => s + x.count, 0);
    const sessions = d.exercise
      .map((e) => [e.kind, e.minutes, e.effort_1_5].filter((v) => v !== null && v !== undefined).join(':'))
      .join(';');
    const minutes = d.exercise.reduce((s, e) => s + e.minutes, 0);
    const drank = d.drank === 1 ? 'yes' : d.drank === 0 ? 'no' : '';
    const row = [
      d.date,
      d.weight_kg,
      d.sleep_hours,
      drank,
      ...DRINK_TYPES.map((t) => byType[t] ?? 0),
      total,
      sessions,
      minutes,
      d.note,
      d.timezone,
    ];
    out.push(row.map(csvField).join(','));
  }
  return out.join('\r\n') + '\r\n';
}
