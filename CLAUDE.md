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

1. **Log it** — Worker + D1 + phone form for weight, drinks, exercise, sleep; CSV import of past weights; CSV export. Done when a full day logs in under 30 seconds. — **Status: in progress**
2. **See it** — dashboard: daily weight dots, 7-day rolling average line, week grid, this week vs last week. — **Status: not started**
3. **Review it** — Sunday-evening cron, Claude-written review with rules fallback, Reviews page, email copy. Done when a review arrives two Sundays running without a manual trigger. — **Status: not started**
4. **Coach it (optional)** — tune the review prompt, push notification from the installed app. — **Status: not started**

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
