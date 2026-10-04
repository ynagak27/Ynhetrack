# CLAUDE.md — Ynhetrack (personal health tracker)

Ynhetrack is a single-user personal health tracker. It logs daily weight, sleep, drinks
and exercise from a phone in under 30 seconds, shows the weekly-average weight trend
instead of daily noise, and every Sunday evening sends a weekly review with 2–3 concrete,
exercise-focused next steps. Drinking is tracked for context only. It must run at zero or
near-zero monthly cost.

**Full spec: PRD.md — read it before any work.**

## Stack

- **Frontend:** static PWA (manifest + service worker) hosted on GitHub Pages, deployed by GitHub Actions
- **Backend:** one Cloudflare Worker — the JSON API plus a Sunday-evening cron trigger for the weekly review
- **Database:** Cloudflare D1 (SQLite), schema managed with D1 migrations
- **Weekly review text:** Claude API, Sonnet 5 (`claude-sonnet-5`), with a rules-based fallback if the call fails
- **Email:** Resend (one HTTP request from the Worker)
- **Auth:** single long secret bearer token, sent by the app, checked by the Worker

## Build phases

Update these status lines at the end of every session.

1. **Log it** — Worker + D1 + phone form for weight, drinks, exercise, sleep; CSV import of past weights; CSV export. Done when a full day logs in under 30 seconds. — **Status: code complete (2026-09-27); waiting on the user to deploy (SETUP.md) and confirm a full day logs in < 30 s on the phone**
2. **See it** — dashboard: daily weight dots, 7-day rolling average line, week grid, this week vs last week. — **Status: not started**
3. **Review it** — Sunday-evening cron, Claude-written review with rules fallback, Reviews page, email copy. Done when a review arrives two Sundays running without a manual trigger. — **Status: not started**
4. **Coach it (optional)** — tune the review prompt, push notification from the installed app. — **Status: not started**

## Repo map

- `web/` — phone PWA, no build step. `js/app.js` (UI + state; morning layout: "This morning" = weight + sleep
  for the viewed date, "Yesterday" = drinks + exercise + note for the day before, switchable to the same day), `js/api.js` (fetch + localStorage connection),
  `js/dates.js` (local-date helpers, tested), `sw.js` (network-first shell cache), `manifest.webmanifest`, `icons/`.
- `worker/src/` — `index.js` (router), `http.js` (CORS, bearer auth), `validate.js`, `days.js` (SQL builders,
  row merging), `csv.js` (import parser, export), `dates.js`. Pure modules are kept free of D1 so they're testable.
- `worker/migrations/` — D1 migrations; add a new numbered file for every schema change, never edit an applied one.
- `worker/test/` — `node:test` suites. `api.test.js` runs the real fetch handler against `fake-d1.js`
  (the real migration on Node's built-in `node:sqlite`), so no test dependencies are needed.
- Commands: `npm test` (repo root, all tests); in `worker/`: `npm run dev`, `npm run deploy`,
  `npm run db:migrate:local|remote`; for both users `npm run db:migrate:all` then `npm run deploy:all`. Serve the app locally with `python3 -m http.server 8000` in `web/`.

## API (phase 1)

All routes except `GET /api/health` need `Authorization: Bearer <API_TOKEN>`.
`GET /api/days?from&to` (≤ 400 days) · `GET /api/days/:date` · `PUT /api/days` (`{timezone, days:[…]}`, ≤ 7 days,
one D1 batch) · `PUT /api/days/:date` · `POST /api/import/weights?tz=` (CSV body, ≤ 1200 rows) ·
`GET /api/export.csv` · `GET /api/settings`.
A day update has optional sections `log` {weight_kg, sleep_hours, note} (only the fields sent are written),
`drinks` (null = unanswered, [] = none, [{type,count}]) and `exercise` (null = unanswered, [] = no exercise,
[{kind, minutes, effort_1_5}]); drinks/exercise also set `daily_log.drank` / `daily_log.exercised`. A section
that is sent replaces what's stored for that date; a section left out is untouched.

## Rules for working on this repo

- Work on one phase per session; don't start the next phase unless the user asks.
- Ask the user before adding any dependency, service or paid feature.
- Never commit secrets. The API token, Claude API key and Resend key live as Worker secrets
  (`wrangler secret put`) and in a gitignored `.dev.vars` locally.
- Keep the frontend dependency-light (plain HTML/CSS/JS or a small framework — propose one and ask).
- Mobile-first: logging a full day must take under 30 seconds on a phone.
- Dates use the phone's local timezone at entry time, stored per entry.
- Drinks are logged for context only: no targets, warnings or judgement anywhere in the UI or reviews.
- Write tests for any calculation logic (weekly averages, stats).
- Commit in small, clearly described steps.

## Decisions log

Add every decision made with the user here, newest last, with the date.

- 2026-09-27 — Stack fixed as above: GitHub Pages PWA, one Cloudflare Worker (API + Sunday cron), D1, Claude API (Sonnet 5) for reviews, Resend for email.
- 2026-09-27 — Weekly exercise targets: 3 lifts, 3 walks, 2 bike sessions. No drink target, ever.
- 2026-09-27 — "Today" is the phone's local date (Europe/London or Asia/Tokyo); the IANA timezone is stored with each entry.
- 2026-09-27 — API protected by a secret bearer token (not Cloudflare Access) for v1.
- 2026-09-27 — Frontend is plain HTML/CSS/JS ES modules, no framework and no build step.
- 2026-09-27 — Dependencies approved: `wrangler` (dev-only, in `worker/`). Tests use Node's built-in `node:test` (no test dependencies). Worker is plain JavaScript.
- 2026-09-27 — Morning-first log form: weight, sleep last night, drinks, exercise, note. The drinks section has a "Last night / Tonight" toggle (defaults to Last night before 15:00 when viewing today); drinks are stored under the evening they happened. *(Superseded 2026-09-30, see below.)*
- 2026-09-27 — `daily_log.drank` stores an explicit drinks answer: 1 yes, 0 no, NULL not answered (so dry days differ from unlogged days).
- 2026-09-27 — Exercise duration presets: strength 60, walk 45, jog 30, bike 30, other 30 min; ±5 buttons; effort optional.
- 2026-09-27 — Weight input: decimal keypad, yesterday's weight shown as a hint, ± 0.1 buttons start from it; "Skip weight today" toggle.
- 2026-09-27 — CSV weight import skips dates that already have a weight (never overwrites) and reports the count. Accepts YYYY-MM-DD, YYYY/MM/DD and DD/MM/YYYY (MM/DD/YYYY only if the file makes that unambiguous), optional header, comma/semicolon/tab separators.
- 2026-09-27 — Phase 1 needs a connection to save (app shell works offline; no offline queue).
- 2026-09-27 — Worker URL and API token are entered once on the app's Settings screen and kept in the phone's localStorage.
- 2026-09-27 — App served from https://ynagak27.github.io/ynhetrack/ (no custom domain); Worker CORS allows that origin plus localhost.
- 2026-09-27 — Added `PUT /api/days` (several dates in one transactional batch) so the morning save writes today's log and last night's drinks together; `PUT /api/days/:date` stays for single days.
- 2026-09-27 — Tapping a selected choice (sleep hours, drinks answer, effort) again unselects it.
- 2026-09-27 — Free-tier guard: every request stays under 50 D1 statements (7 days per save, 30 import rows per INSERT, 1200 rows per import request; the app splits bigger CSVs).
- 2026-09-30 — The app is only opened in the morning, so the log screen has two parts: **This morning** (weight, sleep last night → the viewed date) and **Yesterday** (drinks, exercise, note → the day before). One Yesterday/Today toggle switches the second part; it defaults to Yesterday, except today after 15:00.
- 2026-09-30 — Exercise uses the same format as drinks: "No exercise / Exercised", then one row per kind with − minutes + (first + jumps to the preset; below 5 min = not done). Optional effort 1–5 is kept and shows under each kind that has minutes. One entry per kind per day.
- 2026-09-30 — `daily_log.exercised` (migration 0002) stores the exercise answer like `drank`: 1 / 0 (rest day) / NULL (not answered). The note belongs to the "Yesterday" day.
- 2026-09-30 — `log` updates are partial (only fields sent are written) so the morning weight and yesterday's note can be saved to different dates without wiping each other.
- 2026-10-04 — A second person (the user's partner) uses the app with separate data: wrangler environment `partner` deploys the same code as Worker `ynhetrack-partner` with its own D1 database `ynhetrack-partner` and its own `API_TOKEN`, in the user's Cloudflare account. Same GitHub Pages app; each phone stores its own Worker URL + token. Every server change must be migrated and deployed to both (`db:migrate:all`, `deploy:all`). Phase 3 will need per-environment settings (targets, email address).
