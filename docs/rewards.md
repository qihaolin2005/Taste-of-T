# Rewards: points for eating at the places we recommend

Users earn points (added to `User.xp`) when they **actually eat at a place we recommended**,
shown with a receipt. Getting there by bus or T, going with a bigger group, and spending more all
earn more. Code: `src/features/rewards/`. Every number is in `src/features/rewards/config.ts`.

## The formula

```
points = (meal + spend + travel + first visit) × repeat factor × group multiplier
```

| Part | Points | Notes |
|---|---|---|
| Meal | **20** | Verified receipt at a recommended place |
| Spend | **1 per $2 per person**, up to $60/person (max **30**) | Bill ÷ number of diners on it |
| Travel | **bus 10, T 5**, else 0 | Only a ride the server verified against live MBTA positions (see below) |
| First visit | **+10** | First rewarded visit to that place |
| Repeat factor | 1st & 2nd visit ×1, 3rd ×0.5, after that ×0.25 | Counts your past rewarded visits there |
| Group multiplier | **1 + 0.05 × (people − 1)**, up to 12 people → **×1.55** | People = squad-mates who claimed the same place within 12 h |

Examples:
- **Squad of 6, all bus, $30 each, first visit:** (20 + 15 + 10 + 10) × 1.25 = **69 each**
- **Solo, T, $15, third visit:** (20 + 7.5 + 5) × 0.5 = **16**
- **Squad of 12, all T, $60 each, first visit:** (20 + 30 + 5 + 10) × 1.55 = **101 each** (the maximum)

**Group bonus is fair to whoever claims first.** When another squad-mate claims the same place,
everyone's multiplier is recalculated, and earlier claimers get the difference added. Points
already earned never go down.

**One balance, one history.** Rewards go through P4's `awardPointsTx`
(`src/features/gamification/points.ts`), like quest payouts. Each visit is a `PointsEvent` with
reason `restaurant_visit`, and each top-up a `group_bonus`, linked to the `RewardVisit`. So
`User.xp` always equals the sum of the history, and the profile's Points History shows entries like
"Lantern Dumpling House +52" and "Group bonus · Lantern Dumpling House +3".

## Rules a visit must pass

1. **Recommended:** the place was in the user's "for you" results (`POST /api/me/recommendations`
   now logs these in `RecommendationShown`) or in one of their squads' top 5, within **48 h**.
   A squad top 5 also unlocks the group bonus.
2. **You were there** (`src/features/rewards/presence.ts`), within **3 h** of the receipt time, by
   any one of:
   - **here (GPS check-in):** the claim's `location` is within **150 m** of the place, plus up to
     75 m of the phone's reported GPS error; fixes rougher than 500 m are refused
     (`checkIn()` in `src/features/gamification/checkin.ts`)
   - **trip:** a trip you recorded (`src/features/trips`) passed within 150 m of the place
   - **ride:** a verified bus/T ride ended within **400 m** of it
   Otherwise the claim is refused (403) with what to do. The location is checked, not stored; only
   which proof was used is (`breakdown.verifiedBy`). A place we can't locate can't be claimed.
3. **Receipt, scanned:** the user photographs the receipt; Gemini reads the restaurant name,
   total, date/time and receipt number (`src/features/rewards/receiptOcr.ts`). The server signs
   those facts into a 30-minute token tied to the user, and the claim uses the token's facts,
   not typed values, so the total can't be made up. The photo is never stored.
   - dated within the last **36 h** and not in the future
   - the scanned name must share a real word with the place's name
     ("LANTERN DUMPLING HSE" matches "Lantern Dumpling House")
   - typed receipts are only accepted when scanning isn't configured (no `GEMINI_API_KEY`), so
     the app still runs offline in dev; then only the presence check (rule 2) proves the visit
4. **No reuse:** each person can claim a receipt once, and at most as many people as the
   `diners` on it.
5. **Limits:** one reward **per place per day** (Boston date), **2 rewarded visits per day**.

**Travel points** need a ride verified against live MBTA data (tap Start Trip before boarding;
`src/features/rides`). Nobody picks "bus" or "T": if the claim doesn't name a ride, the server uses
the verified, unused ride that ended within 400 m of the place around the receipt time.

Known limits: a determined user can fake browser GPS (developer tools), and a photo of someone
else's real receipt from that restaurant would still read fine. Each of the other rules (one claim
per receipt, recent receipt, 2 claims a day) caps what that's worth.

## API

**`POST /api/rewards/receipt`** (signed in, multipart form, field `photo`: JPEG/PNG/WebP/GIF under
4 MB; the claim screen shrinks photos to 1600 px first):

→ `200 { receipt: { merchantName, total, date, receiptNumber?, diners? }, receiptToken, expiresAt }`
→ `422` when it isn't a readable receipt (`not_a_receipt` / `unreadable`), with a message to show
→ `503` when scanning isn't set up; `429` after 12 scans in an hour

**`POST /api/rewards/visits`** (signed in):

```json
{
  "placeId": "seed-ct-lantern",
  "location": { "lat": 42.3505, "lng": -71.0621, "accuracyM": 18 },
  "receiptToken": "eyJ1Ijo...sig",
  "diners": 2,
  "travel": { "rideId": "cmw...ride" }
}
```

Without scanning configured, send `"receipt": { "total", "date", "merchantName"?, "receiptNumber"? }`
instead of `receiptToken`. `diners` overrides the guest count read off the receipt. `location`
is optional (a recorded trip or verified ride can prove the visit instead) and `travel` too (the
verified ride that ended near the place is found automatically).

→ `201 { visitId, points, breakdown, groupMultiplier, groupSize, recommendedVia, xp, travelNote?, verifiedBy, checkInDistanceM? }`
(`verifiedBy`: `"here"` / `"trip"` / `"ride"`: how we confirmed you were there)

Errors come back as `{ error: { code, message } }`:

| Code | When |
|---|---|
| `forbidden` (403) | not recommended in the last 48 h, or nothing proves you were there (rule 2) |
| `bad_request` (400) | receipt in the future, too old, or from a different restaurant; no scan (when scanning is on); scan expired or not yours; place location unknown |
| `conflict` (409) | receipt already claimed, or already rewarded at this place today |
| `too_many_requests` (429) | 2 rewarded visits already today |

**`GET /api/me/rewards`** → `{ xp, visits: [...] }`: the XP total and the 20 latest visits, each
with its point breakdown ("20 meal + 15 spend + 10 bus…").

## What other features plug in

- **Ride verification (MBTA, built, `src/features/rides`):** the client no longer says how it
  travelled. While riding, the phone sends a location ping every ~30 s to `POST /api/rides/ping`
  (`startRideTracking()` in `src/features/rides/client.ts` does it). The server matches each ping
  to a **live MBTA bus or train** (V3 `/vehicles`, all subway, light rail, commuter rail and bus).
  A ride is **verified** after 2+ matches on the **same vehicle**, 60+ s and 300+ m apart, faster
  than walking. Then send `travel: { rideId }` with the claim. The server takes the mode (bus or T)
  from the ride and only counts it if it's yours, verified, under 4 h old, ended within 2 km of
  the restaurant, and hasn't already paid out for another visit (one ride, one reward). Otherwise
  the claim still pays meal/spend points and returns a `travelNote` saying why there were no
  travel points. Pings aren't stored; a ride keeps only its first and last matched points
  (rounded to ~11 m), route, and distance.
- **Receipt reading (built, `src/features/rewards/receiptOcr.ts`):** Gemini (`gemini-3.5-flash-lite`,
  minimal thinking) reads the photo into a fixed JSON schema through the `@google/genai`
  Interactions API. Anything it can't read comes back null and the user is asked to retake the
  photo. The photo goes to the Gemini API for that one request and **is never stored by the app**:
  receipts can show card digits and names. Only the total, date and a receipt key are kept. One
  API call per scan, rate limited to 12 an hour per user. Get a free key at
  https://aistudio.google.com/apikey and set `GEMINI_API_KEY`. On the free tier, check Google's
  terms on how request data may be used; use test receipts for demos.
- **GPS check-in (built, `src/features/gamification/checkin.ts`):** pure `checkIn(here, place)`,
  usable by quests too.
- **Points display (P4):** shown by the existing points card and `GET /api/me/points`.

## Database

Tables (run `npm run db:push` after pulling):
- **`RewardVisit`:** one row per rewarded visit, with the receipt facts, travel mode, base points,
  group multiplier, points awarded and a breakdown.
- **`RecommendationShown`:** the latest time each place was shown to each user in "for you".
- **`PointsEvent.rewardVisitId`:** links a history entry to its visit. `RewardVisit.placeName`
  provides the title shown in the history.

## Screens

- **`/rewards/claim`** (`src/components/rewards/ClaimVisitScreen.tsx`): pick a place recommended in
  the last 48 h (`GET /api/rewards/eligible`: squad top 5s first, then "for you" and Spin), scan
  the receipt (shows the restaurant, total and time it read), set the people on it, optionally
  pick a verified ride and rate the meal (the rating goes to `POST /api/ratings` and teaches the
  recommender). "Claim Points" takes a fresh GPS fix for the check-in, then shows the breakdown.
  When `eligible` says `receiptScan: false`, the typed receipt form is shown instead.
- Linked from the squad's top 5 (each pick), the plan page, and Profile → Food → "Claim points for a meal".
