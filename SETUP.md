# Setting up Ynhetrack

This guide takes you from nothing to the app installed on your phone. It assumes you have never used
Cloudflare. It takes about 30–45 minutes the first time. Everything here is free.

**What you'll end up with**

```
Phone app (GitHub Pages)  ──HTTPS + secret token──▶  Cloudflare Worker (the API)  ──▶  D1 database
https://ynagak27.github.io/ynhetrack/                https://ynhetrack.<you>.workers.dev
```

**What you need**

- A computer with a terminal (macOS Terminal, Windows PowerShell, or Linux)
- **Node.js 20 or newer** (22 recommended). Check with `node --version`; install from <https://nodejs.org> if needed
- **git**, and this repo cloned: `git clone https://github.com/ynagak27/ynhetrack.git && cd ynhetrack`
- Your phone

> ⚠️ **GitHub Pages and private repos.** On a free GitHub account, Pages only works for **public**
> repositories. That's safe for this project: the repo contains only code. Your health data lives in your
> Cloudflare D1 database and your token lives on your phone and in Cloudflare. If you'd rather keep the
> repo private, you need GitHub Pro. The alternative is to host the app on Cloudflare Pages instead, which
> we'd need to set up together.

---

## 1. Create a free Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up> and sign up with your email and a password.
2. Confirm your email address from the message Cloudflare sends.
3. In the dashboard's left sidebar, open **Workers & Pages** (under *Compute*).
   The first time, Cloudflare asks you to pick a **workers.dev subdomain**, e.g. `yuta`. Your API will
   later live at `https://ynhetrack.<subdomain>.workers.dev`. Choose one and confirm.
4. You're on the **Free** plan by default. Don't add a payment method; you don't need one.

## 2. Install wrangler (Cloudflare's command-line tool)

Wrangler is already listed as a dev dependency of the Worker, so you install it inside the repo rather
than globally:

```sh
cd worker
npm install
npx wrangler --version      # should print 4.x
```

All `npx wrangler …` commands below are run **from the `worker/` folder**.

## 3. Log wrangler in to your Cloudflare account

```sh
npx wrangler login
```

A browser window opens. Click **Allow**. Back in the terminal, check it worked:

```sh
npx wrangler whoami
```

## 4. Create the D1 database

```sh
npx wrangler d1 create ynhetrack
```

It prints a block that includes a line like:

```
database_id = "a1b2c3d4-...."
```

Open `worker/wrangler.toml` and replace the placeholder
`database_id = "00000000-0000-0000-0000-000000000000"` with your id. The id is not a secret, so commit
this change:

```sh
git add wrangler.toml
git commit -m "Set D1 database id"
git push
```

Now create the tables in the real (remote) database:

```sh
npm run db:migrate:remote
```

Answer **y** when asked. You should see `0001_init.sql ✅`.

## 5. Deploy the Worker

```sh
npm run deploy
```

At the end, wrangler prints your Worker's URL, e.g. `https://ynhetrack.yuta.workers.dev`. **Write it
down.** Check it's alive:

```sh
curl https://ynhetrack.<subdomain>.workers.dev/api/health
# {"ok":true}
```

(You can also just open that URL in a browser.)

## 6. Create and set your secret API token

The token is the password between your phone and the Worker. Generate a long random one:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copy the output into your password manager. Then store it as a Worker secret:

```sh
npx wrangler secret put API_TOKEN
# paste the token when prompted, press Enter
```

The secret is stored encrypted in Cloudflare. It is **never** written to the repo. Until this step is done,
every API call except `/api/health` answers with an error. That's deliberate: the API refuses to run
without a token.

> Later phases will add `CLAUDE_API_KEY` and `RESEND_API_KEY` the same way.

## 7. Turn on GitHub Pages for the app

1. Merge this work into `main` (open a pull request from the `claude/health-tracker-setup-2rfxuu` branch
   and merge it). Pages deploys from `main`.
2. On GitHub, open the repo → **Settings** → **Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Go to the **Actions** tab → **Deploy app to GitHub Pages** → **Run workflow** (on `main`).
   It also runs automatically whenever something in `web/` changes on `main`.
5. When it finishes (about 1 minute), the app is live at **<https://ynagak27.github.io/ynhetrack/>**.

The Worker only accepts browser requests from `https://ynagak27.github.io` and localhost (see
`ALLOWED_ORIGINS` in `worker/wrangler.toml`). If you ever use a custom domain, add it there and run
`npm run deploy` again.

## 8. Install the app on your phone

**iPhone (Safari)**

1. Open <https://ynagak27.github.io/ynhetrack/> in **Safari**.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Open **Ynhetrack** from the home screen.

**Android (Chrome)**

1. Open the URL in **Chrome**.
2. Tap **⋮** → **Install app** (or **Add to Home screen**) → **Install**.

**First launch (both):** the app opens on **Settings**. Enter:

- **Worker URL**: `https://ynhetrack.<subdomain>.workers.dev` (from step 5)
- **API token**: the token from step 6

Tap **Save & test**. You should see **Connected ✓**. Tap **Done**, and you're on today's log.

## 9. Import your old weights (once)

1. Export your weights from the old app as CSV. Two columns, `date, weight_kg`, work best. A header row
   is optional. Dates can be `2026-09-01`, `2026/09/01` or `01/09/2026` (day first). Decimal commas
   (`87,2`) are fine.
2. In Ynhetrack tap **⚙** → **Import past weights** → **Choose CSV file**.
3. It reports how many rows it imported, how many it skipped (dates that already have a weight are never
   overwritten), and any rows it couldn't read.

You can run the import again safely. Rows already imported are simply skipped.

## 10. Daily use

- **Morning:** weight → tap sleep hours → drinks for **last night** (defaults to *Last night* before
  15:00) → add any exercise → **Save**. The status line shows how long the entry took. The goal is under
  30 seconds.
- **Later the same day:** open the app again, add the session, **Save**. Only what you change is updated.
- **Backfill:** use **‹ ›**, tap the date to pick one, or tap a row in **Last 7 days**.
- **Export:** **⚙** → **Download CSV**, any time.

---

## Everyday commands (from `worker/`)

| What | Command |
| --- | --- |
| Deploy Worker changes | `npm run deploy` |
| Apply new database migrations | `npm run db:migrate:remote` |
| Replace the API token | `npx wrangler secret put API_TOKEN` (then update it in the app's Settings) |
| Watch live Worker logs | `npx wrangler tail` |
| Look at the data | `npx wrangler d1 execute ynhetrack --remote --command "SELECT * FROM daily_log ORDER BY date DESC LIMIT 10"` |
| Run tests (from repo root) | `npm test` |

## Running everything locally (optional)

```sh
cd worker
cp .dev.vars.example .dev.vars          # then put any long token in it
npm run db:migrate:local
npm run dev                             # API on http://localhost:8787

# in a second terminal, from the repo root:
cd web && python3 -m http.server 8000   # app on http://localhost:8000
```

In the app's Settings use `http://localhost:8787` and the token from `.dev.vars`.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| "Wrong API token — check Settings." | The token in the app doesn't match the Worker secret. Re-enter it, or set a new one (step 6). |
| "Can't reach the Worker — not saved." | The Worker URL is wrong (no trailing path, must start with `https://`), you're offline, or the app is on a domain not in `ALLOWED_ORIGINS`. |
| `API_TOKEN secret is not set` | Run step 6. |
| `no such table: daily_log` | Run `npm run db:migrate:remote` (step 4). |
| The Pages workflow fails on "deploy" | Settings → Pages → Source must be **GitHub Actions**, and the repo must be public (or you have GitHub Pro). |
| The phone shows an old version of the app | Close the app fully and reopen it. It fetches the latest version when online. |

## What this costs

Nothing, for a single user. The Workers Free plan allows 100,000 requests a day, and D1 Free allows 5 GB
of storage and millions of reads. GitHub Pages is free for public repos. Phase 3 will add the Claude API
(about $0.01–0.02 per weekly review) and Resend (free tier).
