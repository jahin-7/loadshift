# LoadShift

**A power-aware day planner for a small shop running on unpredictable electricity.**

If you run a print shop or a small workshop somewhere with rolling power cuts, you
already know the routine: guess which job to start, hope the grid doesn't cut out
halfway through, and if it does, decide on the spot whether to fire up the generator or
just wait it out. A lot of diesel gets burned on jobs that could've waited twenty
minutes for the power to come back.

LoadShift fixes that by actually planning the day. Give it your jobs and today's known
power-cut windows, and it lays out a schedule that keeps grid-only work off the cut
windows, uses solar or mains whenever it can, and only reaches for the generator when
there's genuinely no other option. It tells you what that plan will cost you in fuel
before you run it. It also tracks your monthly electricity usage from meter readings,
and lets you attach the actual file or order to a job so it's not just a name on a list.

This started as a personal project, not tied to any team or hackathon submission. Just
me building the tool I wished existed. Do what you want with it.

## Where the idea came from

The domain here (jobs tagged by what power they need, a day's cut windows, a shop's
fuel rate) is based on a real published dataset for a "load-shedding job planner"
problem from a local hackathon, genuinely one of the better scheduling problems I'd
seen. I didn't reuse any code from that event; everything here (auth, data model, API,
UI) is a fresh build. The dataset itself is in
[`backend/src/data/print_shop_days.json`](backend/src/data/print_shop_days.json), 25
real day scenarios that now double as the engine's regression test suite (see
[`backend/src/engine/fixtures.test.ts`](backend/src/engine/fixtures.test.ts)).

## How the scheduling actually works

A day runs from `shopOpen` to `shopClose`, with however many power-cut windows you
enter. In Settings you tell the app what power sources your shop actually has beyond
the grid: a generator, solar panels (with a daylight window), both, or neither. Every
job you add gets tagged with what it needs:

| Kind | Meaning |
| --- | --- |
| `grid` | Needs mains power directly. Never gets scheduled inside a cut. |
| `flexible` | Generator or solar, whichever's around. Free if it lands on grid or solar time, and only costs fuel as a last resort. |
| `solar` | Off-grid is fine, but only solar. This job should never touch the generator, even if you have one. If solar can't cover it, it just doesn't get scheduled. |
| `none` | Doesn't need power at all. Runs anywhere, any time, free. |

The auto-planner (`backend/src/engine/schedule.ts`) is a best-fit-decreasing bin-packer.
Roughly, in order: grid jobs get first claim on grid time since they have nowhere else
to go, then flexible and solar jobs grab whatever grid time is left over because that's
free, then whatever's left of the solar-covered cut time goes to solar-only jobs first
since it's their one shot, with flexible jobs taking what remains, then anything
flexible still unplaced falls back to the generator (but only if you actually have
one), and finally jobs that need no power at all soak up cut time first since that
space would otherwise sit idle.

One thing worth knowing: jobs are never split across a cut boundary. A job either fits
whole in a window or it doesn't. That's a simplification I made on purpose: most shops
can't pause a print job halfway and resume it later anyway, and it keeps the whole
algorithm easy to reason about and test properly instead of turning into a much messier
combinatorial problem.

You can also override the plan by hand. No drag-and-drop, just edit a job's start time
directly and the app scores whatever you build (`backend/src/engine/manual.ts`). Unlike
the auto-planner, a manual placement *can* straddle a cut boundary, and fuel only gets
charged for the minutes that actually fall inside the cut and aren't covered by solar.
If you try to put a solar-only job somewhere solar can't reach, it just tells you no. It
won't quietly bill that to the generator instead.

Every generator-minute turns into a real cost using the fuel rate you set in Settings.
New plans lock in that rate (and your power-source setup) when they're created, so
changing your fuel price or adding solar panels later doesn't rewrite what old plans say
they cost.

## What's actually in the app

- **Sign up / sign in**: email and password, or "Continue with Google" if you've set up
  a Client ID (see below). No Client ID means no Google button, and nothing breaks
  either way.
- **Dashboard**: every plan you've made, with feasibility and generator cost visible
  right away.
- **New plan**: shop hours, today's cuts, and your job list.
- **Plan view**: a timeline with cuts shaded and jobs colored by what actually powered
  them, a scrubber, a small 3D scene (generator, solar panel, and a mains pylon, though
  the panel only shows up if you have solar) that lights up whatever's actually running
  at the scrubbed time, a table for manual start-time overrides and attaching a document
  to a job, and buttons to reset to the auto-plan or save your own arrangement.
- **Meter**: log your grid meter reading every so often and see usage between readings,
  totaled by month.
- **Settings**: shop name, which power sources you have, solar hours, fuel rate, and a
  dark/light toggle.

The 3D scene is built entirely in code (react-three-fiber), no downloaded models or
fonts or anything pulled from a CDN. It's there to make it obvious at a glance what's
actually powering things right now, not to look pretty for its own sake. It's also lazy
loaded, so three.js only gets downloaded when you actually open a plan.

## Repository layout

```
/
├── backend/     Node.js + TypeScript + Express REST API (Prisma ORM, SQLite locally)
└── frontend/    Vite + React + TypeScript UI (react-three-fiber for the power scene)
```

## Running it locally

You'll need Node.js 20+.

```bash
git clone <this-repo-url>
cd loadshift

# Backend
cd backend
npm install
cp .env.example .env          # fill in JWT_SECRET (any long random string)
npx prisma migrate dev        # creates prisma/dev.db (SQLite) and applies the schema
npm run dev                   # http://localhost:4100

# Frontend, separate terminal
cd ../frontend
npm install
cp .env.example .env          # VITE_API_BASE_URL already points at localhost:4100
npm run dev                   # http://localhost:5173
```

Open `http://localhost:5173`, make an account, and build your first plan. There's no
seed data, since it's your shop, so you fill it with your own jobs.

### Getting a `JWT_SECRET`

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Optional: "Continue with Google"

You only need a public Client ID here, no client secret, because the backend checks the
Google-issued ID token directly instead of doing a server-side OAuth exchange.

1. Go to [console.cloud.google.com](https://console.cloud.google.com), make or pick a
   project, then open **APIs & Services > OAuth consent screen**, choose External, fill
   in the basics, and save. Testing mode is fine for personal use.
2. Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID** and
   choose Web application.
3. For both Authorized JavaScript origins and Authorized redirect URIs, use
   `http://localhost:5173` (or wherever your frontend actually lives).
4. Copy the Client ID (it'll look like `xxxx.apps.googleusercontent.com`) into both:
   - `backend/.env` as `GOOGLE_CLIENT_ID=...`
   - `frontend/.env` as `VITE_GOOGLE_CLIENT_ID=...`

Skip all this and the app works exactly the same with email and password. The Google
button just won't be there.

## Tests

```bash
cd backend && npm test    # 94 tests: engine logic, all 25 real-dataset scheduling
                           # invariant checks, and mocked-Prisma API route tests
cd frontend && npm run build   # type-checks and builds the UI
```

The frontend doesn't have its own automated tests. I verified it by hand, repeatedly, in
a real browser against the live backend: signing up, building plans, running the
auto-scheduler, scrubbing the timeline, overriding manually, testing a solar-capable
plan, attaching a file, logging meter readings, flipping the theme. That's a real gap
for a project this size and I'd rather say so than pretend the coverage is better than
it is.

## Making it deployable

Everything here runs locally by default, but nothing about it is stuck that way. Here's
what changes for a real deployment.

### Backend: Render, Railway, Fly, or any Node host with Postgres

1. Swap SQLite for Postgres. The schema barely changes:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
   Nothing else needs to change. The schema was written to avoid anything
   provider-specific (no native enums, Zod handles that validation instead), so it
   works on both as-is.
2. Set the real env vars on your host: `DATABASE_URL`, `JWT_SECRET`,
   `FRONTEND_ORIGIN` (has to match your deployed frontend exactly, since CORS is locked
   to one origin, not `*`), and `GOOGLE_CLIENT_ID` if you're using it.
3. If you want job attachments to survive a redeploy, attach persistent storage for
   `backend/uploads/`, since most Node hosts wipe the filesystem on every deploy.
4. Build: `npm ci && npx prisma migrate deploy && npm run build`.
5. Start: `npm run start`.

### Frontend: Vercel, Netlify, Cloudflare Pages, wherever

Build command `npm run build`, output directory `dist/`. Set `VITE_API_BASE_URL` (and
`VITE_GOOGLE_CLIENT_ID` if relevant) to match your backend. These get baked into the JS
at build time, so changing them later means a rebuild, not just a restart.

### That's it, really

Auth is a Bearer JWT instead of a cookie, so there's no cross-site cookie mess to deal
with when the frontend and backend live on different domains. The usual reason people
end up needing a proxy just doesn't come up here.

## Some decisions worth explaining

- **Bearer JWT instead of cookies**: avoids SameSite headaches when frontend and
  backend are on different domains, and means no proxy is needed.
- **Google sign-in verifies the ID token directly**: the frontend gets a signed
  credential from Google, the backend checks it against Google's public keys. No client
  secret to manage, no redirect dance.
- **SQLite for local dev, Postgres for real deployment**: you get a working database
  the moment you run `npx prisma migrate dev`, no external services required, and the
  schema was written so switching later is just a datasource swap.
- **Jobs never split across a cut**: documented above as a real trade-off, not
  something I'm hiding. It keeps the whole thing testable.
- **`solar` means something stronger than `flexible`**: if you tag a job solar-only,
  you're saying "never burn diesel for this." The scheduler takes that literally: a
  missed solar window means the job waits, it doesn't fall back to the generator anyway.
- **Fuel rate and power setup are locked in per plan**: changing your rates or adding
  solar panels later doesn't quietly rewrite what an old plan says it cost.
- **The 3D scene reflects real state, it's not just decoration**: it reads from the
  same computed schedule as the timeline and the table, and the solar panel only
  appears if your shop actually has solar.
- **Attachments are served through an authenticated route, never a static path**: so
  there's no way to guess your way to someone else's document.

## Security, briefly

- Passwords are hashed with bcrypt. Google sign-in verifies the token's signature
  server-side; it never just trusts what the client claims.
- `helmet()` for the standard secure headers, CORS locked to one configured origin.
- Rate limiting on `/auth/signup`, `/auth/login`, and `/auth/google` specifically (to
  blunt brute-forcing), plus a looser limit across the whole API.
- Every plan, job, and meter reading route checks that you actually own the resource
  before returning anything, and returns a plain 404 either way. It never lets you tell
  the difference between "not yours" and "doesn't exist."
- Uploads are capped at 20MB, filtered by type, and stored under a random filename
  instead of whatever the client sent, so there's no path-traversal angle.
- Every input gets validated with Zod before it touches the database.

## What's not done

- No password reset for email/password accounts (Google accounts don't need it, since
  Google handles that side).
- Jobs are atomic, so a job that's longer than every window in the day correctly comes
  back as "won't fit" rather than getting force-split.
- No email verification or real account recovery. Fine for a personal tool, not fine for
  handling strangers' accounts at scale.
- Manual overrides are typed start times, not drag-and-drop. That was a deliberate
  choice for correctness over polish: the validation underneath (overlaps, cut-boundary
  fuel accounting) is the same thing a drag interface would need anyway.
- File uploads are filtered by declared type, not by actually sniffing the content.
  Fine for a personal tool, not something I'd trust against someone determined to upload
  a mislabeled file.
- Attachments live on local disk, so they won't survive a redeploy unless you attach
  persistent storage (see the deploy section above).
