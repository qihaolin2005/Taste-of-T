# Taste of T

Gamified Boston food app on the MBTA. BostonHacks, Eats and Streets track.
Who owns what: see [TEAM.md](TEAM.md).

The app is a Next.js **installable web app (PWA)**. On iPhone it installs from Safari
to the home screen and opens full-screen like a native app. There is no App Store build
and no Mac/Xcode needed.

## Setup (once)

Requires **Node 20.9+** (we use 22, pinned in `.nvmrc`).
On Windows, clone and run everything **inside WSL**, not from a `\\wsl.localhost` path
in PowerShell (slow, and hot reload breaks).

```bash
nvm use            # picks Node 22 from .nvmrc
npm install        # also generates the Prisma client
cp .env.example .env
npm run db:push    # creates prisma/dev.db
```

## Run it

```bash
npm run dev        # http://localhost:3000
```

## Run it on your iPhone

iPhones need **HTTPS** to install the app and to use GPS check-ins, and they can't reach
a WSL dev server directly. So we open a free temporary tunnel (no account needed).

1. Terminal 1: `npm run dev`
2. Terminal 2: `npm run phone`. It prints a URL like `https://something-random.trycloudflare.com`.
3. On the iPhone, open that URL **in Safari** (other browsers can't install apps on iOS).
4. Tap **Share**, then **Add to Home Screen**, then **Add**.
5. Launch **Taste of T** from the home screen. It opens full-screen with no Safari bars.

Notes:
- The tunnel URL changes every time you rerun `npm run phone`, and the app must be re-added
  from the new URL. For the demo, deploy once (see below) and install from the stable URL.
- The tunnel is public while it runs: anyone with the URL can reach your dev server.
  Stop it (Ctrl+C) when you're done.
- Edits hot-reload on the phone too.

## Demo on the projector

Open **`/demo`** on the presenting laptop (e.g. `http://localhost:3000/demo`). It shows the live
app inside an iPhone frame. It's fully clickable, and the buttons on the left jump to each screen.
If you open `/demo` through the `npm run phone` link, the panel also shows that link so judges can
try it on their own phones.

The UI is styled after native iOS / SwiftUI (large titles, inset-grouped lists, blurred tab bar,
system colors, light and dark mode). Build new screens with `@/components/shared/ios`.

## Other scripts

| Script | What it does |
|---|---|
| `npm test` | Vitest (planner unit tests live in `src/features/planner/__tests__`) |
| `npm run typecheck` | Generate Next route types, then `tsc` |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply `prisma/schema.prisma` to the local DB and regenerate the client |
| `npm run db:studio` | Browse the DB in a GUI |
| `npm run icons` | Re-render app icons in `public/icons/` from `scripts/make-icons.tsx` |

## Deploying (for a stable demo URL)

A local SQLite file doesn't persist on Vercel. `src/lib/db.ts` uses the libSQL adapter, so
for a hosted deploy create a free Turso database and set `DATABASE_URL=libsql://...` and
`TURSO_AUTH_TOKEN`. No code changes needed.
