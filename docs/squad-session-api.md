# Squad session ("Start adventure"): API contract for P3

**Status: built.** Logic and storage are in `@/features/squads`. The routes below are in
`src/app/api/rooms/[roomId]/` (start, swipes, session, end, plan), and the swipe UI is
`src/components/group/SquadSession.tsx` on the room screen, with the top 5 also at `/room/[code]/plan`.
Each route resolves the session user with `requireUser()`, normalizes the code, calls one function,
and maps errors (`src/features/squads/http.ts`).

```
host creates squad ──► members join ──► host: Start adventure ──► everyone swipes 10 ──► top 5 plan
   Room(collecting)      RoomMember          Room(swiping, deck)       Swipe rows           Room(planned) + Plan
```

Guests (anonymous users) and signed-in users are treated the same: only the user id matters.
Anyone can host, guests included.

## Routes

| Route | Who | Calls | Returns |
|---|---|---|---|
| `POST /api/rooms/[roomId]/start` | host | `startAdventure(db, roomId, userId, { places })` | `{ deck }` (the 10) |
| `POST /api/rooms/[roomId]/swipes` `{ placeId, liked }` | member | `submitSwipe(db, roomId, userId, placeId, liked)` | `{ finished, plan }` |
| `GET /api/rooms/[roomId]/session` | anyone (poll every ~2 s) | `getLiveState(db, roomId, userId)` | `LiveState` |
| `POST /api/rooms/[roomId]/end` | host | `endAdventure(db, roomId, userId)` | `{ plan }` |
| `GET /api/rooms/[roomId]/plan` | anyone | `getLiveState(...).plan` | `{ plan, status }` |

`GET /api/rooms/[roomId]` (no suffix) is the group's own view (members, host, join info) from
`src/features/rooms`; the session lives at `/session`.

`places` for `start` comes from the places client (`src/lib/places`, still a stub). Until it
exists, pass the seed places as `RestaurantCandidate[]` (see `docs/ml-schema-proposal.md` for fields).

### Errors

Functions throw `SquadSessionError` with a `code`:

| code | HTTP | When |
|---|---|---|
| `not_found` | 404 | no such squad |
| `forbidden` | 403 | not the host (start/end), not a member, or joined after start |
| `conflict` | 409 | started twice, swiping before start, swiping after the plan is made |
| `bad_request` | 400 | place not in the deck, nobody joined, nothing fits everyone's diet |

These codes match `apiError` in `src/lib/api.ts`, so pass `e.code` straight through.

```ts
try {
  return Response.json(await submitSwipe(db, roomId, auth.userId, body.placeId, body.liked));
} catch (e) {
  if (e instanceof SquadSessionError) return apiError(e.code, e.message);
  throw e;
}
```

## Live updates: polling

`GET /api/rooms/[roomId]/session` every ~2 seconds (`SquadSession.tsx` does this). Serverless instances
don't share memory and can't hold WebSockets on Vercel, so the database is the source of truth
and standings are recomputed on each read (milliseconds). `LiveState.version` changes only when
something visible changed, so the client can skip re-rendering.

`LiveState` has:
- `status`: `"collecting"`, `"swiping"`, or `"planned"`
- `isHost`, `myMemberId`
- `deck`: the 10 cards (name, cuisines, rating, price level, neighborhood, reason), or `null` before start
- `progress`: each member still in the squad: swipe count, e.g. "Priya 7/10", and whether they're done
- `leftCount`: how many people left during swiping
- `mySwipes`: `{ placeId: liked }`, so a reloaded phone resumes where it left off
- `standings`: the live top 5 while swiping, the final picks once planned
- `plan`: the saved `SquadPlan` once planned
- `warnings`: for example "Ended early" or "veto turned off"

## What's on the cards

The shortlist is for the night's **first stop** the host picked (`Room.slots`, in the order
dinner → dessert → activity): a dinner night swipes restaurants, a "dessert or boba" night swipes
dessert spots, an activity-only night swipes activities. `LiveState.category` says which.
Candidates come from the squad's city **area**: Boston, Cambridge and Somerville count as one
(`metroAreas` in `src/features/ml/recommend/config.ts`).

## When does it finish?

Automatically, once everyone **still in the squad** has swiped all 10. Or the host taps **End**
early, and the plan is marked `complete: false`. Finishing is atomic, so two simultaneous "last
swipes" create one plan.

**People joining or leaving mid-session:**
- **Joined after the start:** can't swipe this deck and don't block the finish.
- **Left (the member row is deleted by `leaveRoom`):** no longer count toward finishing or the top 5.
  Their swipes stay in their own taste history. If the people left have all finished, the next
  poll of `GET /api/rooms/[code]/session` completes the session, even if the host was the one who left.
  The plan carries a warning ("1 member left during swiping…") and `LiveState.leftCount` says
  how many left.
- **Left and rejoined:** they carry on with their earlier swipes. Participants are matched by user,
  not member row.

**Room codes:** these functions take the room id exactly as stored. Routes should normalize the
code from the URL first (`normalizeCode` in `src/features/rooms/code.ts`: "bhsg" → "BHSG").

## The plan

Saved as a `Plan` row (`roomId`, `result` = `SquadPlan`):
- `recommended`: the #1 pick
- `picks`: the top 5, each with `likes`, `swiped`, `unanimous`, `status` and `reason`
  - `status` is `liked`, `not-voted` (filled from top matches when fewer than 5 got likes),
    or `no-likes`
  - `reason`: e.g. "everyone liked it (4/4)" or "3 of 4 liked it"
- `complete`: `false` if the host ended early

Every squad swipe is also saved to the user's history (`Swipe`, `source: "group"`), so it improves
their solo recommendations next time.
