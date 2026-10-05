# OBSA Weekly Reset

> Obsessed with resetting every week.

OBSA's weekly operating ritual: **look back → review → reflect → rate → learn → reset → commit → start again.**
Every team member runs a ~7 minute reset; the CEO/admin reviews, spots patterns, and opens the next week.
Last week's plan automatically becomes this week's accountability check.

## Stack

- **Next.js 15 (App Router) + React 19 + TypeScript** — server components and server actions
- **SQLite via libSQL + Drizzle ORM** — local file by default; point `DATABASE_URL` at [Turso](https://turso.tech) for a hosted DB
- **Auth** — email + bcrypt-hashed password, DB-backed sessions (SHA-256 hashed token in an httpOnly cookie), per-email login throttle
- **Authorization is server-side** — every page/action/route calls `requireUser`/`requireAdmin`/`assertAdmin`; members can only read/write their own resets (ownership is checked on every save)
- No UI framework: a small hand-written design system in `src/app/globals.css`

## Run it

```bash
npm install
cp .env.example .env          # optional — defaults to file:./data/obsa.db
npm run db:reset              # create schema + seed demo data (wipes local DB)
npm run dev                   # http://localhost:3000
```

Demo logins (password `reset-day`):

| Who | Email | State this week |
|---|---|---|
| Rhea Kapoor — Admin / CEO | `rhea@obsa.team` | in progress |
| Kabir Mehta — Growth | `kabir@obsa.team` | submitted (has a commitment open 4 weeks) |
| Maya Lindqvist — Content | `maya@obsa.team` | not started — best for trying the full flow |
| Dev Sharma — Engineering | `dev@obsa.team` | submitted, low morale (“needs attention”) |

Also: `zoe@`, `arjun@`, `tara@`, `leo@obsa.team`. Seed data is generated relative to today: the current calendar week plus five past weeks.
Set `HIDE_DEMO_LOGINS=1` to hide the demo hint on the sign-in page.

### Deploy on Vercel

The app lives at the repository root and `vercel.json` tells Vercel it's a Next.js app, so pushing to
the connected repo is enough — no project settings needed.

1. Out of the box you get a working **demo**: on first start the app creates its tables and loads the demo team.
   Without a database URL it stores data in the server's temporary folder, so data **resets** whenever Vercel
   recycles the server, and sign-ins may drop. Don't use it for real data like this.
2. For real use, add a shared database. Easiest: in Vercel open **Storage → Create Database → Turso**, connect it
   to this project, then redeploy — the app reads the `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` it sets.
   (Or set `DATABASE_URL` + `DATABASE_AUTH_TOKEN` yourself under **Settings → Environment Variables**.)
   On first start it migrates and loads the demo team; set `SEED_DEMO=0` to start empty instead.

Other hosts: `npm run build && npm start` with `DATABASE_URL` pointing at Turso or a SQLite file on a persistent disk.
Migrations run automatically at startup (`src/instrumentation.ts`).
Reminders: call `GET /api/cron/reminders` hourly with `Authorization: Bearer $CRON_SECRET`.

## How the loop works

| Step | Where |
|---|---|
| Admin starts a week (**START NEW RESET**) — week number, dates, deadline, included members | `/admin/weeks` → `createWeek` |
| Each member's reset is created and last week's **priorities + non-negotiable become commitments** | `hydrateCommitments` in `src/lib/resets.ts` |
| Member walks 7 sections (autosaves, resumable, “Save & continue later”) and submits | `/reset/[id]` (`wizard.tsx`) |
| In **Own It**, unfinished commitments can be **carried forward** into next week's top 3 — they keep a `lineageId`, so we know when the same promise slips week after week (“incomplete for 3 consecutive weeks”) | `commitments.lineage_id` |
| Admin reviews (Reviewed / Kudos / Needs attention / comment) → member is notified | `/admin/resets/[id]` |
| Admin locks the week | `/admin`, `/admin/weeks` |
| History, trends, comparisons and insights read the stored data | `/history`, `/compare`, `/admin/insights` |

Editing rules: drafts are editable until the week is locked; after submitting you can reopen until the deadline unless it's already reviewed.

### Scoring

Overall = weighted average of the active rating categories (weights set in **Settings**). “Higher = worse” categories — e.g. *Incompetence*, framed as a self-check — are flipped (`11 − score`) before weighting. Saving new weights recalculates every stored score. See `src/lib/scoring.ts`.

## Map of the code

```
src/db/schema.ts          tables: users, sessions, weeks, weekly_resets, work_items, wins, misses, learnings,
                          ratings, commitments, priorities, reflections, admin_reviews, notifications, settings, rating_categories
src/lib/auth.ts           sessions + requireUser/requireAdmin
src/lib/resets.ts         week lookup, carry-forward, save/submit/reopen, edit rules, streaks
src/lib/queries.ts        roster, trends, personal history, insights, search
src/lib/themes.ts         recurring-theme extraction for misses/learnings/priorities
src/lib/reminders.ts      reminder channels (in-app today; plug in email/push via ReminderChannel)
src/lib/export.ts         report tables + formatters (CSV today; add PDF via Formatter)
src/app/(app)/…           pages; src/app/actions/… server actions
src/lib/demo-seed.ts      realistic OBSA demo data (also loaded automatically into an empty DB)
tests/weekly-loop.spec.ts end-to-end test of the whole loop (member + admin, mobile viewport)
```

## Tests

```bash
npm run typecheck
npm run test:e2e   # boots a fresh seeded DB (data/e2e.db) on :3100 and runs the full loop in a mobile viewport
```

## Old website

The previous static site that lived in this repo is kept unchanged in `legacy-site/`.
