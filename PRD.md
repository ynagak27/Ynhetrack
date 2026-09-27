# Health Tracker PRD

Sep 27, 2026 · Yuta Nagasaki

## Overview and problem

A personal tracker that logs weight, drinks and exercise in one place, then sends a weekly review with next steps for the following week.

The current app only records weight. Recent readings swing 85.6–90.7 kg within three weeks, and the app can't show why: whether a jump followed a drinking night, a missed workout or a heavy meal. Without that context, each week's plan is guesswork.

The new tool connects the daily inputs to the weekly trend. It tracks drinking for context only, with no target and no judgement, and supports the current plan: full-body lifting 2–3x a week, brisk 45-minute walks, and the home bike as an extra.

## Goals, non-goals and success metrics

**Goals**

- Log a full day (weight, drinks, exercise) in under 30 seconds on a phone
- Show the weekly-average weight trend, not just daily noise
- Send a weekly review every Sunday with 2–3 concrete next steps
- Run at zero or near-zero monthly cost

**Non-goals (v1)**

- Calorie or macro counting per food item
- Social features, sharing or multiple users
- Native iOS/Android apps

**Success metrics**

| Metric | Target |
| --- | --- |
| Days logged per week | 6 of 7 or more |
| Time to log a day | Under 30 seconds |
| Weekly review delivered | Every Sunday, no manual trigger |
| Weekly average weight | Trending down 0.3–0.5 kg/week over 8 weeks |

## User stories and core features

V1 has four features: a daily log, a dashboard, a weekly review, and data import/export.

**1. Daily log (one screen, mostly taps)**

- Weight (kg, one decimal), required by default (skippable per day); defaults to today's date, editable for backfill
- Drinks: yes/no, then count and type (beer, wine, sake, spirits, other)
- Exercise: none, or one or more sessions: strength (full-body A/B), walk, jog, bike, other; duration in minutes; optional effort 1–5
- Sleep: hours slept last night (optional, e.g. 7.5)
- Optional one-line note (e.g. "ate out", "slept badly")
- As a user, I can log last night's drinks the next morning without it counting as today

**2. Dashboard**

- Daily weight as dots, 7-day rolling average as a line
- Week grid: each day marked for drink, lift, cardio or rest
- This week so far: sessions done vs plan, drink days, average weight vs last week

**3. Weekly review (Sunday evening)**

- Summary: weekly average change, sessions completed, drink days and total drinks
- Patterns spotted, e.g. "weight rose after 2 of 3 drink days"
- 2–3 next steps for the week ahead, tied to what slipped
- Shown on a Reviews page in the app and emailed to the user; all past reviews kept for history

**4. Import and export**

- One-off CSV import of past weights from the current app
- CSV export of everything, anytime

**Later (v2 ideas)**

- Log by message (e.g. text "87.2, 2 beers, walked 45")
- Lift progress per exercise (weight × reps)
- Sleep and step counts pulled from a phone health app

## Data model

Four tables cover v1. Dates are stored as local dates using the phone's current timezone at time of entry (Europe/London or Asia/Tokyo), saved per entry, so travel doesn't split a day.

| Table | Fields | Notes |
| --- | --- | --- |
| `daily_log` | date, weight_kg, sleep_hours, note, timezone | One row per day; weight nullable |
| `drinks` | id, date, type, count | Many per day; date = the evening it happened |
| `exercise` | id, date, kind, minutes, effort_1_5 | kind: strength_a, strength_b, walk, jog, bike, other |
| `weekly_review` | week_start, avg_weight, delta_kg, sessions, drink_days, summary, next_steps | Written by the Sunday job; read-only in the app |

A `settings` record holds weekly targets (exercise only: 3 lifts, 3 walks, 2 bike sessions) so the review compares actuals against the plan.

## Weekly review logic

The review runs in two steps: code computes the numbers, then Claude turns them into plain-language next steps.

**Step 1 — computed stats (deterministic)**

1. 7-day average weight and change vs the previous week's average
2. Sessions done vs target, by kind (lifts, walks, bike)
3. Drink days and total drinks (context only, no target)
4. Next-day weight change after drink days vs after dry days
5. Logging streak and missed days

**Step 2 — next steps**

- **Claude (default, about $0.01–0.02 per review):** the stats plus the last 4 weeks of summaries go to the Claude API (Sonnet 5), which writes a short review and 2–3 exercise-focused next steps
- **Rules fallback (free, used if the API call fails):** a fixed set of if-then prompts, e.g. fewer than 2 lifts → "book Mon/Thu lifting slots"; missed walks → "move a walk to the weekend"

**Guardrails**

- Never recommends losing more than about 0.5–1 kg a week, cutting meals, or extreme calorie targets
- Treats single-day swings as noise; judges only on weekly averages
- Mentions drinks only as context for weight swings; never sets a drink target or criticises drinking

## Technical approach

A phone web app (PWA) on GitHub Pages, backed by one Cloudflare Worker with a D1 database and a weekly cron trigger. All of this fits free tiers; the only cost is the Claude API for written reviews.

**Architecture**

- Phone web app (PWA on GitHub Pages) → Cloudflare Worker API (log, read, export) → D1 database
- Sunday evening cron trigger (same Worker) → weekly review job: reads the week's logs from D1, computes stats, calls the Claude API, falls back to rules on failure
- Review is saved to D1 (shown on the app's Reviews page) and a copy is emailed via a free-tier sending service such as Resend (one HTTP request from the Worker)

**Costs**

| Item | Cost |
| --- | --- |
| GitHub repo + Pages | Free |
| Cloudflare Workers + D1 + cron | Free tier covers a single user easily |
| Claude API, one review a week | About $0.01–0.02 per review on Sonnet 5 ($2/$10 per million tokens), so under $1 a year |
| Claude Code to build it | Included with a paid Claude plan |
| Custom domain | Optional, roughly £10/year |

**Security:** single user, so protect the API with a long secret token stored in the app, or Cloudflare Access in front of the Worker. Keep the Claude API key and email key as Worker secrets, never in the repo. Health data stays in the user's own Cloudflare account.

## Build phases

Four short phases, each usable on its own, so logging can start before the review is built.

1. **Log it:** Worker + D1 + phone form for weight, drinks, exercise, sleep; CSV import of past weights. Done when a full day logs in under 30 seconds.
2. **See it:** dashboard with daily dots, 7-day average line and week grid. Done when this week vs last week reads at a glance.
3. **Review it:** Sunday evening cron, Claude-written review with rules fallback, Reviews page in the app, email copy. Done when a review arrives two Sundays running without a manual trigger.
4. **Coach it (optional):** tune the review prompt and add a push notification from the installed app.

## Decisions

- "Today" = the phone's local time (London or Tokyo)
- Weekly targets: 3 lifts, 3 walks, 2 bike sessions; no drink target
- Review written by Claude by default, rules as fallback
- Delivery: in-app Reviews page + email, Sunday evening
