# Ynhetrack

A personal health tracker: log weight, sleep, drinks and exercise from your phone in under 30 seconds,
and (from phase 3) get a weekly review with next steps every Sunday.

- **Spec:** [PRD.md](PRD.md)
- **Set it up:** [SETUP.md](SETUP.md)
- **Notes for Claude Code sessions:** [CLAUDE.md](CLAUDE.md)

| Folder | What |
| --- | --- |
| `web/` | The phone app: a static PWA (plain HTML/CSS/JS) published to GitHub Pages |
| `worker/` | The Cloudflare Worker API, D1 migrations and tests |
| `.github/workflows/` | Pages deploy + tests |

Run the tests with `npm test` from the repo root (Node 22+, nothing to install).
