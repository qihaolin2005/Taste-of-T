# Handoff: ML recommenders + squad sessions (PR #6)

What this PR added, where it lives, and the three things left for the team to wire up.
Start here; the other docs go deeper:

- [`docs/squad-session-api.md`](squad-session-api.md): route contract (request/response, errors, polling)
- [`docs/ml-schema-proposal.md`](ml-schema-proposal.md): restaurant fields the seed data needs
- [`src/features/ml/README.md`](../src/features/ml/README.md): how the models work

## 1. After pulling

```bash
npm install
```

```bash
npm run db:push
```

`db:push` applies the new tables and columns to your local `prisma/dev.db` and regenerates the
Prisma client. Without it you'll get "no such table: Swipe" or missing-field errors. Hosted
Turso databases need the same push.

```bash
npm test
```

You should see 110 passing tests.

## 2. What the feature does

```
host creates squad ──► members join ──► host taps "Start adventure"
   Room "collecting"     RoomMember         │  combine everyone's taste + history
                                            ▼
                               shortlist of 10 saved on Room.deck, Room "swiping"
                                            │
                  every member swipes right/left on all 10 (Swipe rows)
                  every phone polls the room every ~2 s for live scores
                                            │
               last member finishes (or host taps End) ──► top 5 ranked
                                            ▼
                       Plan row saved, Room "planned", #1 is the recommendation
```

- **Anyone can host**, guests (anonymous users) included. Only the user id matters, so this
  works the same before and after Google login lands.
- **Dietary restrictions are a hard filter.** Every one of the 10 satisfies every member's
  restrictions combined. A place with unknown dietary info is never shown to someone with a
  restriction.
- **Swipes are saved as history.** Squad swipes also improve each member's solo
  recommendations next time.

## 3. What was added, by file

| Area | File | What it is |
|---|---|---|
| Database | `prisma/schema.prisma` | New `Swipe` table; new `Room` and preference fields (see section 4) |
| Database | `src/features/squads/store.ts` | All Prisma reads and writes for sessions and swipes |
| Session flow | `src/features/squads/service.ts` | `startAdventure`, `submitSwipe`, `getLiveState`, `endAdventure`: **what routes call** |
| ML | `src/features/ml/session.ts` | Builds the shortlist of 10, live standings, and the final top-5 plan |
| ML | `src/features/ml/recommend/` | Dietary filter, individual recommender, group recommender |
| ML | `src/features/ml/recommend/config.ts` | Every tunable number (deck size 10, weights, thresholds) |
| ML | `src/features/ml/context.ts` | `UserContext.history.checkInPlaceIds` added |
| Users | `src/features/users/` | `city` added to preferences (GET/PATCH `/api/me/preferences` accept it) |
| Tests | `src/features/squads/__tests__/`, `src/features/ml/**/__tests__/` | Session flow against a real test DB; filters and ranking |

Import only through `@/features/squads` and `@/features/ml`, not deep files (TEAM.md rule 3).

## 4. Database changes

| Table | Change | Notes |
|---|---|---|
| `Swipe` | **new** | `userId`, `placeId`, `liked`, `source` (`"solo"` or `"group"`). Squad swipes also have `roomId` and `memberId`. One vote per person per place per session; swiping again updates it. If the member leaves the room, `memberId` is cleared but the swipe stays in their history. |
| `Room` | `+ deck Json?` | The shortlist snapshot (places included), written at start |
| `Room` | `+ startedAt`, `+ finishedAt` | |
| `Room.status` | new value `"swiping"` | `"collecting"` → `"swiping"` → `"planned"` |
| `UserPreferences` | `+ city String?` | e.g. `"Boston"`; the shortlist uses restaurants in the squad's city |
| `RoomMember` | `+ city String?` | Copy it from preferences at join time, like `dietary` |
| `Plan` | unchanged | Squad result is saved here: `roomId`, `result` = `SquadPlan` |

## 5. TODO for the team

### a) Routes: done

Built in `src/app/api/rooms/[roomId]/` (start, swipes, session, end, plan). The original notes:
four thin handlers. Each one gets the user, calls one function, and maps errors. Full contract:
[`squad-session-api.md`](squad-session-api.md).

| Route | Calls |
|---|---|
| `POST /api/rooms/[roomId]/start` | `startAdventure(db, roomId, userId, { places })` |
| `POST /api/rooms/[roomId]/swipes` with body `{ placeId, liked }` | `submitSwipe(db, roomId, userId, placeId, liked)` |
| `GET /api/rooms/[roomId]` | `getLiveState(db, roomId, userId)` |
| `POST /api/rooms/[roomId]/end` | `endAdventure(db, roomId, userId)` |

Example (Next 16: `params` is a Promise; `RouteContext` types come from `next dev`/`next typegen`):

```ts
// src/app/api/rooms/[roomId]/swipes/route.ts
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { SquadSessionError, submitSwipe } from "@/features/squads";

const body = z.object({ placeId: z.string().min(1).max(100), liked: z.boolean() }).strict();

export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[roomId]/swipes">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const parsed = await parseBody(req, body);
  if ("response" in parsed) return parsed.response;
  const { roomId } = await ctx.params;
  try {
    return Response.json(await submitSwipe(db, roomId, auth.userId, parsed.data.placeId, parsed.data.liked));
  } catch (e) {
    if (e instanceof SquadSessionError) return apiError(e.code, e.message);
    throw e;
  }
}
```

Errors come back as `SquadSessionError` with `code`: `not_found` (404), `forbidden` (403),
`conflict` (409), and `bad_request` (400). The codes match `apiError` in `src/lib/api.ts`, so pass them straight through.

When creating a room, set `hostUserId` to the creator's user id. Only that user can start or end.

### b) Swipe UI: done

Built as `src/components/group/SquadSession.tsx` (on the room screen) and `/room/[code]/plan`. It does this:

- Poll `GET /api/rooms/[roomId]/session` every ~2 s. Re-render only when
  `version` changes.
- `status: "collecting"`: show members. If `isHost`, show the **Start adventure** button.
- `status: "swiping"`:
  - show `deck` as cards (name, cuisines, rating, price level, neighborhood, `reason`)
  - skip cards already in `mySwipes`, so a reloaded phone resumes where it left off
  - show `progress` ("Priya 7/10") and the live `standings`
  - if `isHost`, show an **End** button
- `status: "planned"`: show `plan.recommended` and `plan.picks`, each with its `reason`.
  If `plan.complete` is `false`, say the squad ended early.

### c) Restaurant data (P2): `data/seed-restaurants.json` + places client

The seed file is empty, and starting an adventure with no restaurants returns a
`bad_request` error. Each place needs the fields in
[`ml-schema-proposal.md`, section 3](ml-schema-proposal.md#3-restaurant-fields). These matter most:

- `city`: places without one are excluded from squad shortlists
- `dietary` and `dietStyle`: without them a place is never shown to anyone with a restriction
- `cuisines`, `rating`, `reviewCount`, `priceLevel`, `lat`/`lng`, `neighborhood`

What the places client must return, and how it plugs in, is spelled out in
[`docs/restaurant-source.md`](restaurant-source.md). The `start` route gets its places with
`loadRestaurants(listRestaurants)`, which falls back to the seed list if the source fails.

### d) Solo "for you" list: done, just call it

`POST /api/me/recommendations` (empty body is fine) returns the user's ranked recommendations
with a `reason` each, using their dietary needs, ratings, wishlist, check-ins and swipes.

Optional body fields:
- `mode`: `{ kind: "nearby", radiusMiles? }` (the default, 5 mi) or `{ kind: "destination", neighborhood }`
- `limit`: how many results
- `categories`: kinds of place, e.g. `["activity"]`; default `["dinner", "dessert"]`
- `origin`: `{ lat, lng }`, the phone's current position (used once, not stored)
- `candidates`: restaurants to rank; defaults to the seed list

Until the seed list has restaurants, `results` is empty and `warnings` says why. The live
restaurant source plugs in with one line; the contract for it is
[`docs/restaurant-source.md`](restaurant-source.md). The old raw
scoring endpoint moved to `POST /api/me/recommendations/score`.

## 6. Tuning

All numbers are in `src/features/ml/recommend/config.ts`, for example:
- `session.deckSize` (10) and `session.exploreSlots` (2)
- `group.avgWeight` / `group.minWeight` (0.6 / 0.4)
- `group.hateThreshold`
- `blend` weights for taste, rating and distance

Change them there, not in the code. Tests read the same config.

## 7. Not in this PR

- Google login (another teammate). Merging a guest's history into an account on sign-in
  belongs there: move their `Swipe`, `Rating`, `WishlistItem` and `CheckIn` rows to the account's user id.
- Collaborative filtering. The `Swipe` table makes it possible once there's real data.
- Turning the top 5 into a timed itinerary with T directions (the planner, `generatePlan`, is still a stub).
