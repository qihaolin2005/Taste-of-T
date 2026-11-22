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
2. **Receipt:**
   - dated within the last **36 h** and not in the future
   - if a merchant name was read, it must share a real word with the place's name
     ("LANTERN DUMPLING HSE" matches "Lantern Dumpling House")
3. **No reuse:** each person can claim a receipt once, and at most as many people as the
   `diners` on it.
4. **You were there** (`src/features/rewards/presence.ts`), within **3 h** of the receipt time, by
   any one of:
   - **here:** the phone's location sent with the claim (`presence: { lat, lng, accuracyM }`) is
     within **150 m** of the place (+ up to 50 m for GPS error), with a fix of **±100 m** or better
   - **trip:** a trip you recorded (`src/features/trips`) passed within 150 m of the place
   - **ride:** a verified bus/T ride ended within **400 m** of it
   Otherwise the claim is refused (403) with what to do. Only which proof was used is stored
   (`breakdown.verifiedBy`), never the coordinates. A place with no coordinates can't be checked
   and is stored as `"unchecked"`. GPS can be spoofed; this stops casual "typed it from home" claims.
5. **Limits:** one reward **per place per day** (Boston date), **2 rewarded visits per day**.

**Travel points** need a ride verified against live MBTA data (tap Start Trip before boarding;
`src/features/rides`). Nobody picks "bus" or "T": if the claim doesn't name a ride, the server uses
the verified, unused ride that ended within 400 m of the place around the receipt time.

**Receipt OCR** plugs into the claim screen: see [receipt-ocr.md](receipt-ocr.md).

## API

**`POST /api/rewards/visits`** (signed in):

```json
{
  "placeId": "seed-ct-lantern",
  "receipt": { "total": 64.5, "date": "2026-11-21T19:42:00-05:00", "merchantName": "LANTERN DUMPLING", "diners": 2, "receiptNumber": "CHK-1042" },
  "travel": { "rideId": "cmw...ride" }
}
```

→ `201 { visitId, points, breakdown, groupMultiplier, groupSize, recommendedVia, xp, travelNote? }`

Errors come back as `{ error: { code, message } }`:

| Code | When |
|---|---|
| `forbidden` (403) | not recommended in the last 48 h |
| `bad_request` (400) | receipt in the future, too old, or from a different restaurant |
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
- **Receipt reading (OCR, not built yet):** turn the photo into `receipt.total`, `date`, and ideally
  `merchantName` and `receiptNumber`, then call the endpoint. **Don't store the photo**: receipts
  can show card digits and names. Only the total, date and a receipt key are kept.
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
  the last 48 h (`GET /api/rewards/eligible`: squad top 5s first, then "for you" and Spin), type the
  receipt total, time and people on it, optionally pick a verified ride and rate the meal (the
  rating goes to `POST /api/ratings` and teaches the recommender). Shows the points breakdown.
- Linked from the squad's top 5 (each pick), the plan page, and Profile → Food → "Claim points for a meal".
- Receipts are typed in; photo reading (OCR) isn't built.
