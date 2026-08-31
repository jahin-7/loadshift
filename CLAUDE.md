# LoadShift

A power-aware day planner for a small shop (originally modeled on a print/photocopy
shop) that runs jobs against unpredictable electricity load-shedding. It auto-schedules
jobs across a day, keeping grid-only jobs off power-cut windows and minimizing how much
job time actually has to burn generator fuel, then shows the owner what that plan costs.

This is a personal project, not tied to any hackathon team or submission — full source,
own GitHub account, meant to run locally.

## Repository layout

```
/
├── backend/     Node.js + TypeScript + Express REST API (Prisma + SQLite)
└── frontend/    Vite + React + TypeScript UI (react-three-fiber for the power scene)
```

Each half has its own `package.json`, `.env.example`, and README setup steps — see the
root `README.md` for the full run-through.

## Domain model (read this before touching the engine)

- A **Plan** is one day: `shopOpen`/`shopClose`, a list of **cuts** (grid power-outage
  windows for that day), a snapshot of the shop's **capabilities**
  (`hasGenerator`/`hasSolar`/solar window, copied from the User at creation time so
  later Settings changes never retroactively alter an old plan's cost or feasibility),
  and a list of **jobs**.
- Each job has a `power` kind (what it *needs* — `backend/src/engine/types.ts`):
  - `grid` — needs mains power directly; must never be scheduled inside a cut.
  - `flexible` — any off-grid source will do (generator or solar); free if scheduled on
    the grid or on solar, costs fuel only as a last resort on the generator.
  - `solar` — off-grid is fine, but *only* via solar, never the diesel generator even if
    the shop has one. Goes unscheduled rather than ever burning fuel for it.
  - `none` — no power needed at all; can run anywhere, including inside a cut, without
    cost.
- A scheduled job's `actualPower` (what it *ran on*) is a separate, narrower vocabulary:
  `grid` | `generator` | `solar` | `none`. Don't confuse the two — a `flexible` job's
  `actualPower` might be any of the first three depending on what it landed on.
- The **auto-planner** (`backend/src/engine/schedule.ts`) is a best-fit-decreasing
  bin-packer, in priority order: grid jobs claim grid segments first (no alternative) →
  flexible/solar jobs opportunistically fill leftover grid time (free) → solar-tagged
  jobs get first claim on solar-covered cut time (their only off-grid path) → flexible
  jobs take remaining solar-covered time → flexible jobs still unplaced fall back to the
  generator, only if the shop has one (solar jobs never reach this step) → none-jobs
  fill whatever's left, cut segments preferred since that space would otherwise go to
  waste. Jobs are scheduled atomically — never split across a cut boundary — a
  deliberate simplicity/correctness trade-off, not an oversight. Cut segments are
  further sub-split at solar-window boundaries (`backend/src/engine/segments.ts`) so the
  same atomic-placement machinery handles "free solar time" vs "costs-fuel time" as two
  distinct segment types.
- **Manual overrides** (`backend/src/engine/manual.ts`) score a schedule the user
  arranged by hand. Unlike the auto-planner, a manually placed job *can* straddle a cut
  boundary — fuel/solar-coverage is computed proportionally on the actual overlap
  minutes, not the whole job. A `solar`-tagged job placed where solar can't cover it is
  a hard validation error, never silently billed to the generator.
- Every formula lives in `backend/src/engine/*` as pure functions with no I/O — that's
  what makes the 94-case unit + fixture-invariant test suite possible. Don't move
  scheduling logic into the API route handlers.
- **Auth**: email/password (bcrypt) or Google (ID-token verification via
  `google-auth-library`, no client secret — see `backend/src/api/auth.ts`). A User's
  `passwordHash` is nullable for Google-only accounts.
- **Attachments**: a Job may carry one reference document (`attachmentPath`/`Name`/
  `Mime`), stored under `backend/uploads/` with a server-generated random filename and
  served only through an authenticated, ownership-checked route — never a static path.
- **Meter tracking** is a separate, unrelated feature: `MeterReading` rows
  (date + kWh) per user; monthly usage is computed client-side as the delta between
  consecutive readings, not stored.

## Conventions

- TypeScript strict mode throughout; no `any` without a specific reason.
- No comments explaining *what* code does — only *why*, when the reason isn't obvious
  from reading it (e.g. the priority ordering in the auto-planner phases).
- Backend tests mock Prisma via `vi.mock('../db/prisma.js', () => ({ prisma: db }))`
  with a plain object of `vi.fn()`s — see `backend/src/api/*.test.ts` for the pattern.
  Engine tests need no mocking at all; they're pure functions.
- Times are stored and computed as **minutes from midnight** (`number`) everywhere
  inside the engine and database. `HH:MM` strings only exist at the API boundary
  (`backend/src/engine/time.ts` converts both ways).

## Git

**Do not add a Claude/AI co-author trailer to commits in this repository.** Commit as
the repo owner only (`jahin-7`), no `Co-Authored-By: Claude` or `Claude-Session` lines.
Only commit and push when explicitly asked to.
