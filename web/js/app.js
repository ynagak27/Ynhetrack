// Ynhetrack phone app: one-screen daily log plus a settings/data screen.

import { api, getConnection, setConnection } from './api.js';
import { localDate, localTimezone, addDays, shortLabel, relativeLabel, defaultDrinksEvening } from './dates.js';

const DRINK_TYPES = [
  ['beer', 'Beer'],
  ['wine', 'Wine'],
  ['sake', 'Sake'],
  ['spirits', 'Spirits'],
  ['other', 'Other'],
];
const EXERCISE = {
  strength_a: { label: 'Lift A', minutes: 60 },
  strength_b: { label: 'Lift B', minutes: 60 },
  walk: { label: 'Walk', minutes: 45 },
  jog: { label: 'Jog', minutes: 30 },
  bike: { label: 'Bike', minutes: 30 },
  other: { label: 'Other', minutes: 30 },
};
const SLEEP_OPTIONS = Array.from({ length: 13 }, (_, i) => 4 + i * 0.5); // 4–10 h
const IMPORT_CHUNK_LINES = 1000;

const $ = (sel) => document.querySelector(sel);
const cache = new Map(); // date -> day object from the API

const state = {
  today: localDate(),
  date: localDate(),
  evening: 'previous', // 'previous' = last night, 'same' = this date's evening
  weight: '',
  skipWeight: false,
  sleep: null,
  drinks: { answer: null, counts: {} }, // answer: null | 'no' | 'yes'
  exercise: [], // [{kind, minutes, effort_1_5}]
  note: '',
  startedAt: null, // first tap on this form, for the "took N s" readout
  loading: false,
};

// ---------- helpers ----------

function drinksDate() {
  return state.evening === 'previous' ? addDays(state.date, -1) : state.date;
}

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.className = `status ${kind}`;
}

function touch() {
  state.startedAt ??= Date.now();
  const status = $('#status');
  if (status.classList.contains('error')) setStatus(status, ''); // clear a stale validation message
}

function lastWeightBefore(date) {
  let best = null;
  for (const d of cache.values()) {
    if (d.date < date && d.weight_kg != null && (!best || d.date > best.date)) best = d;
  }
  return best;
}

function drinksAnswerFromDay(day) {
  if (!day || day.drank == null) return { answer: null, counts: {} };
  const counts = Object.fromEntries(day.drinks.map((d) => [d.type, d.count]));
  return { answer: day.drank ? 'yes' : 'no', counts };
}

function button(className, text, attrs = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  return b;
}

// ---------- loading ----------

async function fetchRange(from, to) {
  const { days } = await api.getRange(from, to);
  for (let d = from; d <= to; d = addDays(d, 1)) cache.delete(d);
  for (const day of days) cache.set(day.date, day);
}

function fillFormFromCache() {
  const day = cache.get(state.date);
  state.weight = day?.weight_kg != null ? day.weight_kg.toFixed(1) : '';
  state.skipWeight = Boolean(day && day.weight_kg == null && day.timezone && hasLogData(day));
  state.sleep = day?.sleep_hours ?? null;
  state.note = day?.note ?? '';
  state.exercise = (day?.exercise ?? []).map((e) => ({ kind: e.kind, minutes: e.minutes, effort_1_5: e.effort_1_5 }));
  state.drinks = drinksAnswerFromDay(cache.get(drinksDate()));
  state.startedAt = null;
}

function hasLogData(day) {
  return day.sleep_hours != null || day.note != null || day.exercise.length > 0;
}

async function loadDate(date) {
  state.date = date;
  state.today = localDate();
  state.evening = defaultDrinksEvening(date, state.today);
  state.loading = true;
  render();
  setStatus($('#status'), 'Loading…');
  try {
    await fetchRange(addDays(date, -14), date);
    fillFormFromCache();
    setStatus($('#status'), '');
  } catch (err) {
    fillFormFromCache();
    setStatus($('#status'), err.message, 'error');
  }
  state.loading = false;
  render();
  renderRecent();
}

// ---------- rendering ----------

function renderHeader() {
  $('#date-main').textContent = relativeLabel(state.date, state.today);
  $('#date-sub').textContent = state.date === state.today ? shortLabel(state.date) : '';
  $('#next-day').disabled = state.date >= state.today;
  $('#date-input').value = state.date;
  $('#date-input').max = state.today;
}

function renderWeight() {
  const input = $('#weight');
  if (document.activeElement !== input) input.value = state.weight;
  input.disabled = state.skipWeight;
  $('#skip-weight').checked = state.skipWeight;
  document.querySelectorAll('[data-weight-step]').forEach((b) => (b.disabled = state.skipWeight));
  const last = lastWeightBefore(state.date);
  $('#weight-hint').textContent = last ? `Last: ${last.weight_kg.toFixed(1)} (${relativeLabel(last.date, state.today)})` : '';
}

function renderSleep() {
  const wrap = $('#sleep-chips');
  if (!wrap.childElementCount) {
    for (const h of SLEEP_OPTIONS) {
      wrap.append(button('chip', String(h), { 'data-sleep': String(h), 'aria-pressed': 'false' }));
    }
  }
  for (const b of wrap.children) b.setAttribute('aria-pressed', String(Number(b.dataset.sleep) === state.sleep));
  $('#sleep-value').textContent = state.sleep == null ? '— h' : `${state.sleep} h`;
}

function renderDrinks() {
  const prevLabel = state.date === state.today ? 'Last night' : 'Night before';
  const sameLabel = state.date === state.today ? 'Tonight' : 'That evening';
  $('#evening-previous').textContent = prevLabel;
  $('#evening-same').textContent = sameLabel;
  $('#evening-previous').setAttribute('aria-pressed', String(state.evening === 'previous'));
  $('#evening-same').setAttribute('aria-pressed', String(state.evening === 'same'));
  $('#drinks-date').textContent = `evening of ${shortLabel(drinksDate())}`;
  document.querySelectorAll('[data-drinks-answer]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.drinksAnswer === state.drinks.answer));
  });

  const box = $('#drink-counters');
  box.hidden = state.drinks.answer !== 'yes';
  if (!box.childElementCount) {
    for (const [type, label] of DRINK_TYPES) {
      const row = document.createElement('div');
      row.className = 'counter';
      const name = document.createElement('span');
      name.textContent = label;
      const value = document.createElement('output');
      value.id = `drink-${type}`;
      row.append(
        name,
        button('step-btn small', '−', { 'data-drink': type, 'data-delta': '-1', 'aria-label': `One less ${label}` }),
        value,
        button('step-btn small', '+', { 'data-drink': type, 'data-delta': '1', 'aria-label': `One more ${label}` }),
      );
      box.append(row);
    }
  }
  for (const [type] of DRINK_TYPES) $(`#drink-${type}`).textContent = state.drinks.counts[type] ?? 0;
}

function renderExercise() {
  const add = $('#exercise-add');
  if (!add.childElementCount) {
    for (const [kind, { label }] of Object.entries(EXERCISE)) add.append(button('chip', `+ ${label}`, { 'data-add-session': kind }));
  }
  const list = $('#sessions');
  list.replaceChildren();
  state.exercise.forEach((s, i) => {
    const card = document.createElement('div');
    card.className = 'session';
    const title = document.createElement('div');
    title.className = 'session-head';
    const name = document.createElement('strong');
    name.textContent = EXERCISE[s.kind].label;
    title.append(name, button('link-btn', 'Remove', { 'data-remove': i }));

    const mins = document.createElement('div');
    mins.className = 'counter';
    const out = document.createElement('output');
    out.textContent = `${s.minutes} min`;
    mins.append(
      button('step-btn small', '−5', { 'data-minutes': i, 'data-delta': '-5', 'aria-label': 'Minus 5 minutes' }),
      out,
      button('step-btn small', '+5', { 'data-minutes': i, 'data-delta': '5', 'aria-label': 'Plus 5 minutes' }),
    );

    const effort = document.createElement('div');
    effort.className = 'effort';
    const lab = document.createElement('span');
    lab.className = 'muted small';
    lab.textContent = 'Effort';
    effort.append(lab);
    for (let e = 1; e <= 5; e++) {
      effort.append(button('chip small', String(e), { 'data-effort': i, 'data-value': e, 'aria-pressed': String(s.effort_1_5 === e) }));
    }
    card.append(title, mins, effort);
    list.append(card);
  });
  const total = state.exercise.reduce((sum, s) => sum + s.minutes, 0);
  $('#exercise-total').textContent = state.exercise.length ? `${total} min` : 'rest day';
}

function render() {
  renderHeader();
  renderWeight();
  renderSleep();
  renderDrinks();
  renderExercise();
  if (document.activeElement !== $('#note')) $('#note').value = state.note;
  $('#save-btn').disabled = state.loading;
}

function summarise(day) {
  const bits = [];
  if (day.weight_kg != null) bits.push(`${day.weight_kg.toFixed(1)} kg`);
  if (day.sleep_hours != null) bits.push(`${day.sleep_hours} h sleep`);
  if (day.drank === 1) bits.push(`${day.drinks.reduce((s, d) => s + d.count, 0)} drinks`);
  if (day.drank === 0) bits.push('no drinks');
  for (const e of day.exercise) bits.push(`${EXERCISE[e.kind].label.toLowerCase()} ${e.minutes}m`);
  return bits.join(' · ') || 'not logged';
}

function renderRecent() {
  const list = $('#recent-list');
  list.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const date = addDays(state.today, -i);
    const day = cache.get(date);
    const li = document.createElement('li');
    const b = button('recent-row', '', { 'data-goto': date });
    if (date === state.date) b.setAttribute('aria-current', 'date');
    const when = document.createElement('span');
    when.className = 'recent-date';
    when.textContent = relativeLabel(date, state.today);
    const what = document.createElement('span');
    what.className = day ? '' : 'muted';
    what.textContent = day ? summarise(day) : 'not logged';
    b.append(when, what);
    li.append(b);
    list.append(li);
  }
}

// ---------- saving ----------

function buildSave() {
  let weight = null;
  if (!state.skipWeight) {
    const w = Number(String(state.weight).replace(',', '.'));
    if (state.weight === '' || !Number.isFinite(w)) return { error: 'Enter your weight, or tap “Skip weight today”.' };
    if (w < 30 || w > 300) return { error: 'Weight should be between 30 and 300 kg.' };
    weight = Math.round(w * 10) / 10;
  }
  const today = {
    date: state.date,
    log: { weight_kg: weight, sleep_hours: state.sleep, note: state.note.trim() || null },
    exercise: state.exercise,
  };
  const days = [today];

  // Send drinks when answered now, or when clearing a previously stored answer.
  const dDate = drinksDate();
  const stored = cache.get(dDate)?.drank ?? null;
  if (state.drinks.answer !== null || stored !== null) {
    let drinks = null;
    if (state.drinks.answer === 'no') drinks = [];
    if (state.drinks.answer === 'yes') {
      drinks = DRINK_TYPES.map(([type]) => ({ type, count: state.drinks.counts[type] ?? 0 })).filter((d) => d.count > 0);
      if (!drinks.length) return { error: 'Add at least one drink, or choose “No drinks”.' };
    }
    if (dDate === state.date) today.drinks = drinks;
    else days.push({ date: dDate, drinks });
  }
  return { days };
}

async function save(event) {
  event.preventDefault();
  const status = $('#status');
  const built = buildSave();
  if (built.error) return setStatus(status, built.error, 'error');
  $('#save-btn').disabled = true;
  setStatus(status, 'Saving…');
  try {
    const { days } = await api.saveDays(localTimezone(), built.days);
    for (const d of days) cache.set(d.date, d);
    const secs = state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : null;
    setStatus(status, secs ? `Saved ✓ — took ${secs} s` : 'Saved ✓', 'ok');
    state.startedAt = null;
    renderRecent();
    renderWeight();
  } catch (err) {
    setStatus(status, err.message, 'error');
  } finally {
    $('#save-btn').disabled = false;
  }
}

// ---------- events ----------

function onLogClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;

  if (d.weightStep) {
    touch();
    const base = state.weight !== '' ? Number(String(state.weight).replace(',', '.')) : lastWeightBefore(state.date)?.weight_kg;
    const next = (Number.isFinite(base) ? base : 80) + Number(d.weightStep);
    state.weight = (Math.round(next * 10) / 10).toFixed(1);
  } else if (d.sleep) {
    touch();
    const h = Number(d.sleep);
    state.sleep = state.sleep === h ? null : h;
  } else if (d.evening) {
    state.evening = d.evening;
    state.drinks = drinksAnswerFromDay(cache.get(drinksDate()));
  } else if (d.drinksAnswer) {
    touch();
    state.drinks.answer = state.drinks.answer === d.drinksAnswer ? null : d.drinksAnswer;
  } else if (d.drink) {
    touch();
    const c = (state.drinks.counts[d.drink] ?? 0) + Number(d.delta);
    state.drinks.counts[d.drink] = Math.max(0, Math.min(50, c));
  } else if (d.addSession) {
    touch();
    if (state.exercise.length < 10) state.exercise.push({ kind: d.addSession, minutes: EXERCISE[d.addSession].minutes, effort_1_5: null });
  } else if (d.remove !== undefined) {
    state.exercise.splice(Number(d.remove), 1);
  } else if (d.minutes !== undefined) {
    touch();
    const s = state.exercise[Number(d.minutes)];
    s.minutes = Math.max(5, Math.min(600, s.minutes + Number(d.delta)));
  } else if (d.effort !== undefined) {
    touch();
    const s = state.exercise[Number(d.effort)];
    const v = Number(d.value);
    s.effort_1_5 = s.effort_1_5 === v ? null : v;
  } else {
    return;
  }
  render();
}

function showSettings(show) {
  $('#settings-view').hidden = !show;
  $('#log-view').hidden = show;
  document.querySelectorAll('.topbar .icon-btn:not(#open-settings), .date-btn').forEach((b) => (b.hidden = show));
  if (show) {
    const c = getConnection();
    $('#api-url').value = c?.url ?? '';
    $('#api-token').value = c?.token ?? '';
    $('#close-settings').hidden = !c;
  }
}

async function onSettingsSubmit(e) {
  e.preventDefault();
  const status = $('#settings-status');
  try {
    setConnection($('#api-url').value, $('#api-token').value);
    setStatus(status, 'Testing…');
    await api.settings();
    setStatus(status, 'Connected ✓', 'ok');
    $('#close-settings').hidden = false;
    loadDate(state.date);
  } catch (err) {
    setStatus(status, err.message, 'error');
  }
}

async function onImport(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const status = $('#import-status');
  const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return setStatus(status, 'That file is empty.', 'error');
  const header = /[a-z]/i.test(lines[0]) ? lines[0] : null;
  const body = header ? lines.slice(1) : lines;
  const totals = { imported: 0, skipped: 0, error_count: 0, errors: [] };
  try {
    for (let i = 0; i < body.length; i += IMPORT_CHUNK_LINES) {
      setStatus(status, `Importing… ${Math.min(i + IMPORT_CHUNK_LINES, body.length)} / ${body.length}`);
      const chunk = [header, ...body.slice(i, i + IMPORT_CHUNK_LINES)].filter((l) => l !== null).join('\n');
      const r = await api.importWeights(chunk, localTimezone());
      totals.imported += r.imported;
      totals.skipped += r.skipped;
      totals.error_count += r.error_count;
      totals.errors.push(...r.errors.map((er) => ({ ...er, line: er.line ? er.line + i : 0 })));
    }
    let msg = `Imported ${totals.imported}, skipped ${totals.skipped} (already had a weight).`;
    if (totals.error_count) {
      msg += ` ${totals.error_count} rows not understood, e.g. ` + totals.errors.slice(0, 3).map((er) => `row ~${er.line}: ${er.message}`).join('; ');
    }
    setStatus(status, msg, totals.error_count ? 'warn' : 'ok');
    fetchRange(addDays(state.today, -14), state.today).then(renderRecent, () => {});
  } catch (err) {
    setStatus(status, `${err.message} (imported ${totals.imported} before the error)`, 'error');
  }
}

async function onExport() {
  const status = $('#export-status');
  setStatus(status, 'Preparing…');
  try {
    const blob = await api.exportCsv();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ynhetrack-export-${localDate()}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setStatus(status, 'Downloaded ✓', 'ok');
  } catch (err) {
    setStatus(status, err.message, 'error');
  }
}

function wire() {
  $('#log-form').addEventListener('click', onLogClick);
  $('#log-form').addEventListener('submit', save);
  $('#weight').addEventListener('input', (e) => {
    touch();
    state.weight = e.target.value;
  });
  $('#weight').addEventListener('blur', () => {
    const w = Number(String(state.weight).replace(',', '.'));
    if (state.weight !== '' && Number.isFinite(w)) state.weight = w.toFixed(1);
    renderWeight();
  });
  $('#skip-weight').addEventListener('change', (e) => {
    touch();
    state.skipWeight = e.target.checked;
    renderWeight();
  });
  $('#note').addEventListener('input', (e) => {
    touch();
    state.note = e.target.value;
  });

  $('#prev-day').addEventListener('click', () => loadDate(addDays(state.date, -1)));
  $('#next-day').addEventListener('click', () => state.date < state.today && loadDate(addDays(state.date, 1)));
  $('#date-btn').addEventListener('click', () => {
    const input = $('#date-input');
    if (input.showPicker) input.showPicker();
    else input.click();
  });
  $('#date-input').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v && v <= localDate()) loadDate(v);
  });
  $('#recent-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (b) {
      loadDate(b.dataset.goto);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  $('#open-settings').addEventListener('click', () => showSettings($('#settings-view').hidden));
  $('#close-settings').addEventListener('click', () => showSettings(false));
  $('#settings-form').addEventListener('submit', onSettingsSubmit);
  $('#import-file').addEventListener('change', onImport);
  $('#export-btn').addEventListener('click', onExport);

  // If the app stays open past midnight, move "today" forward.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = localDate();
    if (now !== state.today) {
      const wasToday = state.date === state.today;
      state.today = now;
      if (wasToday && state.startedAt === null) loadDate(now);
      else render();
    }
  });
}

function init() {
  wire();
  render();
  renderRecent();
  if (!getConnection()) {
    showSettings(true);
  } else {
    loadDate(state.today);
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
