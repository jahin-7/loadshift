# LoadShift

**A power-aware day planner for a small shop running on unpredictable electricity.**

Print shops, workshops, and small manufacturers in areas with rolling power cuts
("load-shedding") end up guessing which job to run when — and burning diesel generator
fuel on work that could have simply waited twenty minutes for the grid to come back, or
run for free on solar instead. LoadShift takes a day's jobs and power-cut windows and
automatically lays out a schedule that keeps grid-only jobs off cut windows, prefers
free power (grid, then solar) over diesel, and shows exactly what the plan costs in
fuel. It also tracks monthly grid electricity usage from meter readings, and lets a job
carry a reference document (the file to print, a customer's order).

This is a personal project — not tied to any team, hackathon, or submission. Full
source below, MIT-equivalent "do what you want with it" personal use.

## Why this shape

The domain (jobs tagged by power need, a day's power-cut windows, a per-shop generator
fuel rate) is modeled on a real published sample dataset for a "load-shedding job
planner" problem statement from a local hackathon — a genuinely good, concrete
scheduling problem. No code from that event was reused; this is an independent build
with its own auth, data model, API, and UI. See
[`backend/src/data/print_shop_days.json`](backend/src/data/print_shop_days.json) — 25
real day scenarios used as the scheduling engine's regression/invariant test suite (see
[`backend/src/engine/fixtures.test.ts`](backend/src/engine/fixtures.test.ts)).

## How the scheduling actually works

A day is `shopOpen`–`shopClose` with zero or more power-cut windows. A shop declares
which power sources it actually has beyond the grid — a diesel generator, solar panels
(with a daylight window), both, or neither — in **Settings**. Every job carries a
`power` kind describing what *it* needs:

| Kind | Meaning |
| --- | --- |
| `grid` | Needs mains power directly. Must never be scheduled inside a cut. |
| `flexible` | Any off-grid source will do — generator or solar, whichever's available. Free if it lands on the grid or on solar; costs fuel only as a last resort, on the generator. |
| `solar` | Off-grid is fine, but *only* via solar — must never run on the diesel generator, even if the shop has one. Goes unscheduled rather than burning fuel. |
| `none` | No power needed at all — can run anywhere, including inside a cut, for free. |

**Auto-plan** (`backend/src/engine/schedule.ts`) is a best-fit-decreasing bin-packer,
in priority order:

1. `grid` jobs claim grid-power windows first — they have no other option.
2. `flexible` and `solar` jobs opportunistically fill whatever grid time is left over,
   since running on mains costs nothing.
3. Of what's left, `solar`-tagged jobs get first claim on solar-covered cut time — it's
   their only possible off-grid path. `flexible` jobs take whatever solar time remains.
4. Any `flexible` jobs still unplaced fall back to the generator (fuel cost), only if
   the shop has one. `solar` jobs never reach this step.
5. `none` jobs fill remaining cut-window time first (otherwise wasted), then leftover
   grid time.

Jobs are placed atomically — never split across a cut boundary. That's a deliberate
simplicity/correctness trade-off: real shops mostly can't pause a print job halfway
through and resume it later either, and it keeps the algorithm's behavior fully
explainable and exhaustively testable rather than a much harder combinatorial problem.

**Manual override**: drag isn't the mechanism — you edit a job's start time directly
in the plan view, and the app scores whatever arrangement you build
(`backend/src/engine/manual.ts`). Unlike auto-plan, a manually placed job *can*
straddle a cut boundary; fuel is charged only for the minutes that actually overlap a
cut and aren't covered by solar, not the job's full duration, since a machine just
needs continuous power regardless of which source is supplying it. A `solar`-tagged job
placed somewhere solar can't cover is rejected outright, not silently billed to the
generator.

Every generator-minute is converted to a currency cost via the shop's fuel rate
(liters/hour) and price/liter, set in **Settings**. New plans snapshot the rate *and*
the shop's power-source capabilities at creation time, so past plans' costs and
feasibility stay accurate even if you change fuel prices or add solar panels later.

## Screens

- **Sign up / sign in** — email + password (bcrypt-hashed, JWT bearer auth), or
  "Continue with Google" if `VITE_GOOGLE_CLIENT_ID` is configured (see below) — the
  button simply doesn't render otherwise, no broken state.
- **Dashboard** — every day plan you've built, with feasibility and generator cost at a glance.
- **New plan** — enter shop hours, today's power cuts, and the job list.
- **Plan view** — a timeline (cuts shaded, jobs colored by what actually powered them),
  a scrubber, a small 3D scene (generator, solar panel, and mains pylon — the panel
  only appears if the shop has solar) whose active/idle glow follows whatever's
  scheduled at the scrubbed time, a job table with editable start times for manual
  overrides and a per-job document attachment, and Reset-to-auto-plan /
  Save-my-arrangement actions.
- **Meter** — log periodic grid meter readings (date + kWh); LoadShift computes usage
  between consecutive readings and totals it by month.
- **Settings** — shop name, which power sources the shop has (generator/solar, with a
  solar daylight window), generator fuel rate/price, and a dark/light appearance toggle.

The 3D scene (`frontend/src/components/PowerScene.tsx`, react-three-fiber) is
procedurally built — no downloaded models, textures, or fonts, nothing fetched from a
CDN. It exists to make the *actual* backend-computed power source at a point in time
legible at a glance, not as decoration. It's also lazy-loaded — three.js only downloads
when you open a plan, not on login/dashboard/settings.

## Repository layout

```
/
├── backend/     Node.js + TypeScript + Express REST API (Prisma ORM, SQLite locally)
└── frontend/    Vite + React + TypeScript UI (react-three-fiber for the power scene)
```

## Run it locally

Requirements: Node.js 20+.

```bash
git clone <this-repo-url>
cd loadshift

# Backend
cd backend
npm install
cp .env.example .env          # fill in JWT_SECRET (any long random string)
npx prisma migrate dev        # creates prisma/dev.db (SQLite) and applies the schema
npm run dev                   # http://localhost:4100

# Frontend (separate terminal)
cd ../frontend
npm install
cp .env.example .env          # VITE_API_BASE_URL already points at localhost:4100
npm run dev                   # http://localhost:5173
```

Open `http://localhost:5173`, create an account, and build a plan. No seed data is
required or provided — this is a personal tool, so the database starts empty and you
populate it with your own shop's jobs.

### Generating a `JWT_SECRET`

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Optional: "Continue with Google"

Only a public Client ID is needed — no client secret, since the backend verifies the
Google-issued ID token directly (`google-auth-library`) rather than doing a server-side
OAuth code exchange.

1. [console.cloud.google.com](https://console.cloud.google.com) → new/existing project
   → **APIs & Services → OAuth consent screen** → External → fill in app name/email →
   save (Testing mode is fine for personal use).
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Web
   application.
3. Authorized JavaScript origins and Authorized redirect URIs: both
   `http://localhost:5173` (or your deployed frontend origin).
4. Copy the Client ID (`xxxx.apps.googleusercontent.com`) into **both**:
   - `backend/.env` → `GOOGLE_CLIENT_ID=...`
   - `frontend/.env` → `VITE_GOOGLE_CLIENT_ID=...`

Without this, the app works exactly the same via email/password — the Google button
just doesn't appear.

## Tests

```bash
cd backend && npm test    # 94 tests: engine unit tests, all 25 real-dataset scheduling
                           # invariant checks, and mocked-Prisma API route tests
cd frontend && npm run build   # type-checks and production-builds the UI
```

The frontend doesn't have its own automated test suite — correctness there was
verified with repeated manual passes in a real browser against the live local backend
(signup → build a plan → auto-schedule → scrub the timeline → manual override →
solar-capable plan → file attachment → meter readings → theme toggle → settings), not
just type-checking. That's a real limitation for a project this size; seeing it called
out explicitly is more honest than pretending otherwise.

## Making it deployable

The app is built to run locally, but nothing about it is locked to that — here's what
actually changes for a real deployment.

### Backend → Render / Railway / Fly (any Node host + Postgres)

1. Swap SQLite for Postgres — the schema itself barely changes:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
   (No other model changes needed — this project deliberately avoids
   provider-specific features like native enums, using plain `String` fields with
   Zod validation at the API boundary instead, so the same schema works on both.)
2. Set real env vars on the host: `DATABASE_URL` (a managed Postgres connection
   string), `JWT_SECRET`, `FRONTEND_ORIGIN` (your deployed frontend's exact origin —
   CORS is locked to one origin, not `*`), and optionally `GOOGLE_CLIENT_ID`.
3. Attach a persistent disk (or swap to object storage) for `backend/uploads/` if you
   want job attachments to survive redeploys — most Node hosts' filesystem is ephemeral.
4. Build command: `npm ci && npx prisma migrate deploy && npm run build`.
5. Start command: `npm run start`.

### Frontend → Vercel / Netlify / Cloudflare Pages

1. Build command `npm run build`, output directory `dist/`.
2. Set `VITE_API_BASE_URL` (and optionally `VITE_GOOGLE_CLIENT_ID`) to match the
   deployed backend. Vite bakes these into the JS bundle at build time, so changing them
   later means a rebuild, not just a restart.

### Nothing else moves

Auth is a Bearer JWT (not a cookie), so there's no cross-site cookie/SameSite
complexity to solve when frontend and backend end up on different domains — the
pattern that usually forces a same-origin proxy setup doesn't apply here.

## Major design decisions

- **Bearer JWT over cookie sessions** — sidesteps SameSite/credentials-mode issues for
  a frontend and backend that may live on different domains, with no proxy required.
- **Google sign-in via ID-token verification, not OAuth code exchange** — the frontend
  gets a signed credential from Google Identity Services and the backend verifies it
  against Google's public keys; no client secret to manage, no server-side redirect
  dance.
- **SQLite locally, Postgres-ready** — zero external services needed to run this
  project; `npx prisma migrate dev` and you have a working database. The schema
  intentionally avoids anything SQLite can't also do, so deploying is a datasource
  swap, not a rewrite.
- **Jobs scheduled atomically, never split across a cut** — keeps the algorithm
  explainable and exhaustively testable; documented as a real trade-off, not hidden.
- **`solar` is a stricter promise than `flexible`, not just a preference** — a shop
  owner who tags a job `solar`-only is explicitly saying "never burn diesel for this,"
  so the scheduler treats a missed solar window as "leave it unscheduled," never as
  "fall back to the generator anyway."
- **Fuel rate and power-source capabilities snapshotted per plan** — editing your
  generator's fuel rate or adding solar panels in Settings doesn't retroactively change
  what old plans say they cost or whether they were feasible.
- **3D tied to real state, not decorative** — the power scene's only job is to make
  "what's actually running right now, and off which power source" visible at a glance;
  it reads directly from the same computed schedule the timeline and job table use, and
  the solar panel only appears in the scene at all if the shop actually has one.
- **Attachments stored on disk, served only through an authenticated, ownership-checked
  route** — never under a static file path, so there's no way to guess a URL to
  someone else's document.

## Security notes

- Passwords hashed with bcrypt (cost 12); Google sign-in verifies the ID token's
  signature against Google's public keys server-side, never trusts the client's claim.
- `helmet()` for standard secure headers; CORS locked to one configured origin.
- Rate limiting (`express-rate-limit`): a tight limit on `/auth/signup`,
  `/auth/login`, `/auth/google` specifically (blunts credential stuffing / brute force),
  plus a looser limit across the whole API as general flood protection.
- Every plan/job/meter-reading route checks resource ownership (`userId` match) before
  returning anything, and returns a plain 404 rather than a 403 on mismatch — never
  confirms *whether* a resource exists to a user who doesn't own it.
- File uploads are size-capped (20MB) and mimetype-filtered (PDF/PNG/JPEG/WEBP/GIF);
  stored under a server-generated random filename, never the client-supplied name, so
  there's no path-traversal surface.
- All input validated with Zod at the API boundary before touching the database.

## Known limitations

- No password reset flow for email/password accounts (Google sign-in sidesteps this
  entirely, since Google handles the account recovery).
- Jobs are atomic; a job longer than every available window (grid or cut) in a day
  will correctly come back "won't fit" rather than being force-split.
- No email verification or fine-grained account recovery — appropriate for a personal
  tool, not for handling real strangers' accounts at scale.
- Manual overrides are single-job edits (typed start time), not pixel-drag-and-drop —
  chosen deliberately for correctness over polish; the underlying validation
  (overlap detection, cut-boundary fuel/solar accounting) is exactly what a drag
  interface would need anyway.
- File uploads are declared-mimetype-filtered, not content-sniffed — acceptable for a
  personal single-user tool, not hardened against a determined adversary uploading a
  mislabeled file.
- Local file storage for attachments won't survive a redeploy on most hosts unless you
  attach persistent storage (see the deploy section above).
