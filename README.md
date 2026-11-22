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

1. Run **`npm run dev:phone`**. It starts the app, waits until it's ready, opens the tunnel,
   and prints a link plus a **QR code**.
2. Scan the QR code with the iPhone camera and open the link **in Safari** (other browsers
   can't install apps on iOS).
3. Tap **Share**, then **Add to Home Screen**, then **Add**.
4. Launch **Taste of T** from the home screen. It opens full-screen with no Safari bars.

Ctrl+C stops the app and the tunnel together. If `npm run dev` is already running,
`dev:phone` reuses it and only adds the tunnel. (`npm run phone` still exists if you
only want the tunnel; it does nothing unless the app is also running on port 3000.)

Notes:
- The tunnel URL changes every run, and the app must be re-added from the new URL.
  For the demo, deploy once (see below) and install from the stable URL.
- Google Maps on the phone: allow `*.trycloudflare.com/*` on your Maps API key,
  otherwise the map falls back to the offline version.
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

## Login and first-run onboarding

Opening the app signed out takes you to **`/login`**: sign in, create an account (email +
password), **Continue with Google**, or **Continue as Guest** (handy for judges). A new account, including a guest,
is then sent to **`/onboarding`**, which asks for dietary restrictions (vegetarian, vegan,
halal, kosher, gluten-free, dairy-free, nut allergy) and optional foods to skip. Those
become hard constraints for planning and the ML model. Sign Out is on the Profile tab.

- Passwords are hashed with scrypt; the hash never leaves the server.
- Login is rate limited (10 tries per email / 30 per IP per 15 min).
- `src/proxy.ts` does the redirects (signed out → `/login`, not onboarded → `/onboarding`).
  It's a UX check on the signed cookie; every API route still verifies the session.
- `/demo` stays open, and the app inside its iPhone frame shows the login flow.
- A guest who signs up keeps their progress (the API upgrades the guest in place).
  TODO(P3): add a "Create account" entry point for guests in Profile.

### Sign in with Google

1. Google Cloud Console → **APIs & Services → OAuth consent screen**: set it up (External,
   app name "Taste of T"), and add your team's Google accounts as **test users** while the
   app is in testing mode.
2. **Credentials → Create credentials → OAuth client ID → Web application.** Under
   **Authorized JavaScript origins**, add every address you open the app from:
   `http://localhost:3000`, plus your deployed `https://` domain.
3. Put the client ID in `.env` as `NEXT_PUBLIC_GOOGLE_CLIENT_ID=...` and restart. (It's not a
   secret. There's no client secret to store.)

How it works: Google's button returns a signed ID token, and `POST /api/auth/google` checks
it against Google's keys (issuer, our client ID as audience, expiry, verified email). The first
Google sign-in creates an account (or upgrades the current guest) and goes through dietary
onboarding. If an email/password account already uses that email, Google is linked to it and
the password is removed: Google proved who owns the email, and we never verified it.

**Phone caveat:** Google only allows exact origins, so the random `*.trycloudflare.com` link from
`npm run dev:phone` can't be authorized (it changes every run). On the phone, use email or guest
login with the tunnel, or deploy to a fixed domain and add it as an origin. Without a client ID,
the Google button is simply hidden.

After pulling this change, update your local DB with `npx prisma db push --accept-data-loss`.
The flag only acknowledges the new unique `email` and `googleSub` columns; existing local users
have neither, so nothing is lost.

| Endpoint | What it does |
|---|---|
| `POST /api/auth/signup` | `{ email, password, displayName? }` → 201 `{ user }` (409 if the email is taken) |
| `POST /api/auth/login` | `{ email, password }` → `{ user }` or 401 |
| `POST /api/auth/google` | `{ credential }` (Google ID token) → `{ user }` or 401 |
| `POST /api/auth/guest` | Start as a guest → 201 `{ user }` |
| `POST /api/auth/logout` | Sign out on this device |
| `POST /api/me/onboarding` | `{ dietary, avoid?, displayName? }` → marks onboarding done |

## Backend: users, preferences, location

Each signed-in device holds a signed httpOnly session cookie. From the browser, use the helpers
in `src/lib/identity.ts` (`logIn`, `signUp`, `continueAsGuest`, `logOut`, `completeOnboarding`,
`getMe`, `savePreferences`, `shareCurrentLocation`, …) instead of calling fetch by hand.

| Endpoint | What it does |
|---|---|
| `POST /api/me` | Refresh the session for the signed-in user → `{ user }`; 401 if signed out |
| `GET /api/me` | `{ user, preferences, location }` |
| `PATCH /api/me` | `{ displayName?, avatar? }` |
| `DELETE /api/me` | Delete the user and **all** their data, and clear the cookie |
| `GET` / `PATCH /api/me/preferences` | Tastes, avoid, dietary, default budget, max walk, home/usual stations, `shareLocation` |
| `GET` / `PUT` / `DELETE /api/me/location` | Last known location + nearest station. `PUT` returns 403 unless `shareLocation` is on |

Errors always look like `{ error: { code, message, issues? } }`.

**Location privacy:** stored only after the user opts in (`shareLocation: true`). It's a
single overwritten row (no movement history), rounded to about 11 m, and deleted when
sharing is turned off or the account is deleted. The only location history is explicit
check-ins.

The full data model (check-ins, stamps, achievements, rooms, plans, ratings, wishlist) is in
`prisma/schema.prisma`. After changing it, run `npm run db:push`.

`SESSION_SECRET` must be set for `npm start` and any deploy (`openssl rand -base64 32`).

## Groups (join with a code)

On the **Night** tab, either type a 4-letter code (e.g. `BHSG`) and tap **Join Group**, or start
a new group: it gets a fresh code that anyone can use to join. Codes:

- 4 letters with no `I` or `O` (so nobody mixes them up with 1 and 0), not case-sensitive.
- Unique while the group is alive. Groups expire after 2 days, then the code can be reused.
- Max 12 people per group.

The group page (`/room/BHSG`) shows the code with **Invite friends** (iOS share sheet), your
info (start/home station, budget, leaving early), and **Who's Coming**, which updates every 4 s,
so new people pop in without a refresh. Dietary needs and tastes are copied from each member's
profile. Other members only see your name and starting station; budget, home station, and
dietary needs stay private (the planner reads them on the server). Wrong-code lookups are rate
limited per IP so nobody can scan for strangers' groups.

| Endpoint | What it does |
|---|---|
| `POST /api/rooms` | `{ name, day: "tonight"\|"tomorrow", startTime, slots }` → 201 `{ code }` |
| `GET /api/rooms/BHSG` | The group as you see it (polled). 404 if unknown/expired |
| `POST /api/rooms/BHSG/members` | Join, or update your info. 409 if full |
| `DELETE /api/rooms/BHSG/members` | Leave |

"Plan the Night" opens the plan page, which is still a placeholder until `generatePlan()` (P1) lands.

## T map

`/map` shows the real MBTA network (all subway lines and branches, 125 stations), live train
positions, and which stations you've stamped.

- **Offline map (default)**: the map draws the real MBTA geometry as an SVG, so it uses no
  Google quota. Trip maps work the same way. It's also the automatic fallback when Google
  Maps is on but the key is missing or bad, or there's no internet.
- **Google Maps**: set `NEXT_PUBLIC_MAP=google` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in
  `.env` (create a key with the "Maps JavaScript API" enabled in Google Cloud Console, and
  restrict it to your domains, since it ships to browsers). Restart `npm run dev` after
  changing either one.
- **Station data** is a committed snapshot in `data/stations.json`. Refresh it with
  `npm run stations`.
- **Live trains** come from `GET /api/vehicles`, which proxies MBTA `/vehicles` with a
  shared 10 s cache, so we stay under the 20 requests/min no-key limit. Set `MBTA_API_KEY`
  (free at api-v3.mbta.com) for 1000/min.

## Bus/T rides (verified with live MBTA data)

Reward points for getting to a restaurant by **bus (+10)** or **T (+5)** are only given for a
ride the server checked against live MBTA vehicle positions, so nobody can just claim one.

1. During a trip (see Trips below) the phone sends its location to `POST /api/rides/ping` every
   30 s, whatever the speed (`startRideTracking()` in `src/features/rides/client.ts` does the
   same on its own). Pings that aren't on any vehicle store nothing.
2. Each ping is compared with every live MBTA vehicle (all buses, subway, light rail, commuter
   rail, from the V3 `/vehicles` feed, shared 10 s cache). Every vehicle near you scores a
   match. The one you're really on keeps matching; bunched buses and the next train on the
   same track drift away. The vehicle with the most matches (ties: closest on average) is
   yours, and gives the mode (bus / T) and the name ("Bus 62", "Green Line C").
3. **Verified** = 2+ matches on that vehicle, 60+ s and 300+ m apart, faster than walking. Slow
   traffic (buses often average walking pace) also counts after 4+ matches over 3+ minutes.
   Standing at a stop while a bus passes, or walking along a bus route, doesn't count.
4. After that, pings keep following the vehicle, so the ride ends where you got off.
5. Send the ride's id with the reward claim: `travel: { rideId }` (see `docs/rewards.md`).

Tested live (phone position = the vehicle's live position, sent through the real API): Bus 62
verified after 4 matches and followed for 3.9 km; Green Line C verified on the right train
while a second C train ran 100–400 m behind it the whole time.

**Limits:** the app has to stay open during the ride (iOS web apps can't track location in the
background). **Underground, phones often have no GPS fix**, so subway rides verify on the
above-ground parts (Green Line surface, Red Line to Braintree/Ashmont, Orange Line ends). The
Silver Line tunnel (SL1/SL2/SL3 at South Station–Seaport) has the same problem: there the MBTA
itself only reports a bus's position about once a minute. Buses on streets and commuter rail
work best. Raw pings aren't stored, only each ride's first and last matched points (rounded to
~11 m) and a short list of nearby vehicle ids with match counts.

## Spin the T

Pick **how far** (0.5 / 1 / 2 / 5 mi), a **budget** ($ to $$$ or any) and a **craving**, tap
**Spin**. It uses where your phone is right now (not saved; falls back to your saved location)
and asks the ML recommender (`getRecommendations`, `src/features/ml`) for places within that
distance, ranked for you (dietary needs are hard filters). The model works in miles, not travel
time, so Spin asks "how far?". Budget and craving filter the ranking, then the spin is a
weighted-random pick from your top 6. A specific craving also runs a Google search near you
("dumplings" near me), because the general list only has ~20 places per area.

The pick becomes a quest (+100 points). **Let's Go** records the trip there (bus/T rides get
verified on the way); arriving (or tapping I'm Here within 150 m) completes the quest once.
Starting at the door or a trip under a minute doesn't count. Code: `src/features/spin`,
`POST /api/spin`, `src/components/solo/SpinScreen.tsx`.

## Trips (everyone's path to the restaurant, like Strava)

Tap **Start Trip** (in a group: Group > Trip Map, or solo: Profile > My trips). The phone asks
for location only then, records your path until you reach the restaurant (within 60 m ends it
automatically) or tap **I'm Here**, and the group's **Trip Map** shows everyone's path on one
map: thick lines for bus/T, thin for walking, plus distance, time and which bus/T line they took.

- While you're moving at vehicle speed, the recorder also sends ride pings, so bus/T legs get
  verified for travel points along the way (see above). The screen stays on while recording,
  because iPhone web apps can't track location in the background.
- **Privacy:** solo trips are only visible to you. Group trips are visible to group members while
  the group exists (2 days), and disappear for people who leave. Others never see the first
  200 m of your path (it often starts at home). You can delete any of your trips.
- Code: `src/features/trips` (path cleaning, walk/transit split, recorder in `client.ts`), API
  `/api/trips`, `/api/trips/:id(/points|/finish)`, `/api/rooms/:code/trips`, pages `/trips`,
  `/trips/:id`, `/room/:code/trips`.

## Points and quests

Every account has a points balance, shown on **Profile** (with a history) and **Home**.
Completing a quest adds that quest's points to the account.

- A quest's point value is fixed **by the server when the quest is created** (`pointsForQuest`
  in `src/features/gamification/points.ts`). Today every quest is worth 100. **TODO(ML):** swap
  in the points model there; nothing else changes. The API never accepts a points value.
- Points only change through `awardPoints`, which writes a `PointsEvent` log row and updates
  `User.xp` (the balance) in one transaction, so the total always equals the log.
- A quest pays out **once**: completing it again (double tap, retry, two phones) awards 0.
- Completion isn't verified yet (no check-in required), so quest creation is capped at 20 per
  user per day. TODO(P4): require a check-in at the quest's station before paying out.

| Endpoint | What it does |
|---|---|
| `GET /api/me/points` | `{ total, events }` (newest first) |
| `GET /api/me/quests?status=active` | Your quests |
| `POST /api/me/quests` | `{ title, stationId? }` → 201 `{ quest }` (points set by the server) |
| `POST /api/me/quests/:id/complete` | `{ quest, awarded, alreadyCompleted, total }` |

Spin the T (P1) should create its quests with `createQuest()` so they can be completed for points.

## Restaurants (Google Places)

Real restaurants, dessert spots, and activities come from **Google Places API (New)** when
`PLACES_API_KEY` is set (a server-only key; setup in [src/lib/places/README.md](src/lib/places/README.md)).
Without it, the app uses 32 fictional demo places in `data/seed-restaurants.json`, so everything
works offline. The ML recommendations (`POST /api/me/recommendations`) use the same source.

- `GET /api/restaurants?station=place-chncl&category=dinner&q=dumplings` → `{ places, from, warning? }`
- Google data is cached **in memory only** (default 60 min); Google's terms don't allow saving it.

## ML recommendations and squad sessions

Solo recommendations, group recommendations, and the live squad flow (host starts → everyone
swipes on a shortlist of 10 → top 5 plan). **Start with [docs/HANDOFF-ml-squads.md](docs/HANDOFF-ml-squads.md)**:
what was added, the database changes (`npm run db:push` after pulling), and what's left to wire up.

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
