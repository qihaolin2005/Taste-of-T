# ML layer: how a model gets information about a person

The app never hands a model raw database rows. It builds one **`UserContext`**: a
versioned, validated JSON object with everything a model is allowed to know about one
person. It also builds a **feature vector** (the same information as fixed, named numbers)
for classic ML. A model scores **candidate places**, and the planner uses the scores.

```
DB (user, preferences, location, stamps, ratings, wishlist)        RoomMember (join form)
          │ buildUserContext(db, userId)                                 │ memberToContext(m)
          └──────────────────────────────┬──────────────────────────────┘
                                         ▼
                              UserContext (v1, JSON)  ──toFeatures()──▶  FeatureVector (111 named numbers)
                                         │
                     scoreCandidates(context, candidates)
                       ├─ ML_MODEL_URL set & answers → remote model's scores
                       └─ otherwise / on error       → baselineModel (offline, rule-based)
```

## What's in a UserContext

| Field | Source | Notes |
|---|---|---|
| `subjectId` | salted SHA-256 of the user id | Stable per person, not reversible. No name or avatar is ever included. |
| `kind` | | `"user"` (has an account) or `"member"` (room member, maybe no account) |
| `preferences.tastes` / `avoid` | preferences | Lowercased tags, e.g. `dumplings`, `seafood` |
| `preferences.dietary` | preferences / join form | `vegetarian`, `vegan`, `halal`, `kosher`, `gluten-free`, … Strict for halal/kosher/allergies; soft for vegetarian/vegan (see `dietary.ts`). |
| `preferences.budgetPerPerson`, `maxWalkMinutes` | preferences | `null` if unknown |
| `stations.home` / `start` / `homeLines` | preferences | MBTA station ids (`place-harsq`) + line families |
| `location` | last known location | **Only if the user opted in** and it's < 24 h old. Coarsened to 3 decimals (~110 m), plus `nearestStationId` and `ageMinutes`. Otherwise `null`. |
| `time` | server clock, **Boston local time** | `localHour`, `minutesAfterMidnight`, `dayOfWeek` (0 = Sun), `isWeekend` |
| `history` | check-ins, stamps, ratings, wishlist | Counts, stamped station ids, lines visited, last 50 ratings `{placeId, score 0-10}`, last 50 wishlist ids. No timestamps of where someone was. |
| `consent.location` | preferences | Whether location sharing is on |

The schema lives in `context.ts` (`userContextSchema`, zod). See a real one for yourself:
`GET /api/me/context` returns `{ context, features }` for the current user.

## Feature vector

`toFeatures(context)` → `{ version, names, values }`, with 111 values in a fixed order:
one-hot `taste:*`, `avoid:*`, `diet:*`, `home_line:*`, `visited_line:*`, then numeric
features (budget, walk, location relative to Downtown Crossing, time of day and week
encoded as sin/cos so 23:00 and 01:00 are close, activity counts). Definitions are in
`features.ts`; vocabularies are in `vocab.ts`. **Only append** to vocabularies, and bump
`FEATURE_VERSION` if names or order change.

## Plugging in a real model (e.g. Python)

Set in `.env`:

```bash
ML_MODEL_URL=http://localhost:8000/score   # your service
ML_MODEL_TIMEOUT_MS=1500                    # slower than this → baseline is used
ML_MODEL_TOKEN=                             # optional, sent as "Authorization: Bearer ..."
```

The app sends `POST ML_MODEL_URL`:

```json
{
  "version": 1,
  "context": { "...UserContext..." },
  "features": { "version": 1, "names": ["taste:american", "..."], "values": [0, "..."] },
  "candidates": [
    { "id": "p1", "category": "dinner", "tags": ["dumplings"], "pricePerPerson": 15,
      "stationId": "place-chncl", "dietary": ["vegetarian"] }
  ]
}
```

and expects, **one score per candidate in the same order**, where higher is better and
`null` means never recommend:

```json
{ "scores": [0.92], "model": "my-model-v3" }
```

Minimal FastAPI service:

```python
from fastapi import FastAPI
app = FastAPI()

@app.post("/score")
def score(req: dict):
    f = dict(zip(req["features"]["names"], req["features"]["values"]))
    out = []
    for c in req["candidates"]:
        if set(req["context"]["preferences"]["dietary"]) - set(c.get("dietary") or []):
            out.append(None)  # respect hard dietary constraints
            continue
        out.append(sum(f.get(f"taste:{t}", 0) for t in c["tags"]))  # replace with model.predict(...)
    return {"scores": out, "model": "my-model-v1"}
```

If the service is down, slow, or returns the wrong number of scores, the app **falls back
to `baselineModel`** and reports `fallbackReason`, so the demo keeps working offline.

To try it without the planner: `POST /api/me/recommendations/score` with `{ "candidates": [...] }`.

## Rules for model code

- **Dietary needs are hard constraints.** Return `null` for places that can't serve them.
- The context includes coarse location. Only send it to a model service **we run**, never
  to a third-party API.
- Beat `baselineModel` on held-out data before switching the default; it's the benchmark.

## Recommenders (`recommend/`)

Two pure, synchronous recommenders on top of `UserContext`. All tunable numbers are in
`recommend/config.ts`. Missing data (swipes, restaurant fields, city) is listed in
[`docs/ml-schema-proposal.md`](../../../docs/ml-schema-proposal.md).

**Dietary filter (`dietary.ts`).** Runs before any scoring. Each place gets a fit per need: yes /
likely / maybe / no. Halal, kosher and allergies are strict (only places that list them).
Vegetarian and vegan are softer, because Google only tells us "serves vegetarian food" and "vegan
restaurant": a strict rule left vegans with 1-2 places. `non-veg-only` is always out; "yes" and
"likely" places (e.g. vegetarian options at a Thai or Indian place, for a vegan) are always in;
"maybe" places only when fewer than `config.dietary.minPool` are left. Lower fits score a little
less (`config.dietary.fitWeight`) and their reason says "likely has vegan options" or "check the
menu". Groups use the union of members' needs.
(`baselineModel` still treats unknown as a soft -0.5; not changed yet.)

**Individual: `recommendForUser(ctx, places, opts)`**
- Candidates: `nearby` (5 mi haversine from location, then start, then home station) or
  `destination` (a neighborhood plus places near its center).
- Then: dietary filter, `avoid` tags, places the user rated badly.
- Preference: ratings (signed), wishlist and check-ins (weak likes), optional swipes, with recent
  items weighted higher. The user vector is a weighted average of liked minus disliked restaurant
  vectors (cuisine, price level, Bayesian rating, dietary flags).
- Starting taste: cuisines picked in onboarding (`preferences.tastes`) seed the vector like one like's
  worth of weight, and give confidence 0.6 on day one (`statedTastes` in config). Real ratings and
  swipes gradually outweigh them. Reason: "you said you like thai".
- Score = similarity, quality and distance. The similarity weight ramps in with evidence, so with no
  history and no stated cuisines it's quality and distance only.
- Then MMR for cuisine variety, and a reason per result.

**Group: `buildGroupDeck(members, places)` → `rankAfterSwipes(deck, votes, memberIds)`**
- Deck: city, union dietary, per-member individual scores, group score
  `0.6 × mean + 0.4 × min`, a veto when anyone would hate a place (dropped if it leaves < 5), and
  ~18 cards with MMR variety plus 3 explore picks.
- Travel fairness (`config.group.travel`): each member's straight-line distance from tonight's start
  station scores 1 at the door to 0 at 6 mi; the group's travel score is `0.6 × mean + 0.4 × min`
  (the longest ride counts extra), blended in at a small weight: `0.85 × taste + 0.15 × travel`.
  It reorders near-ties and pushes down places that are a long ride for one person, but a clearly
  better place still wins (it can overcome a taste lead of about 0.18 × the travel gap; see the
  config comment for how 0.15 was chosen). Cards say "close for everyone" or "a long ride for one
  of you (4.6 mi)". A place we can't locate gets the average travel score. Straight line for now;
  T travel time (src/features/directions planSubwayTrip) would be the next step.
- Top 5: like ratio among members who swiped, then a bonus if every member liked it, then group
  score, then rating. Short on likes → fill from unvoted places, marked `not-voted`.
- `groupVotesToSwipes()` turns group votes into each member's individual swipes (weighted 0.7).

**"For you" API: `recommendations.ts`.** `POST /api/me/recommendations` calls
`getRecommendations(db, userId, { mode?, limit?, origin?, candidates? })`. It builds the
`UserContext`, loads the user's swipes (`history.ts`), and runs `recommendForUser`. Candidates
come from a `RestaurantSource` (`recommend/source.ts`; the places client plugs in there, see
[`docs/restaurant-source.md`](../../../docs/restaurant-source.md)). If it's missing, fails or times out,
they come from `data/seed-restaurants.json`.

**Kinds of place, areas, tags (`config.ts`).** Places are `dinner`, `dessert` or `activity`, like
the room stops. Activities skip the dietary filter. The squad shortlist uses the room's first stop;
the solo list defaults to dinner + dessert. `metroAreas` groups cities (Boston + Cambridge +
Somerville = Greater Boston) for the squad city filter. `nonTasteTags` ("late-night",
"vegan-friendly") stay on places but don't count toward taste, variety, or reasons.

**Squad session: `session.ts`.** Combines every member's taste and history into a shortlist of 10
(`createSessionDeck`), tracks `sessionProgress` and `liveStandings` as swipes arrive, and builds
the final top-5 `SquadPlan` once everyone has swiped all 10. Database storage and the
start/swipe/live/end flow are in `src/features/squads`; the route contract is in
[`docs/squad-session-api.md`](../../../docs/squad-session-api.md).

## Training data (next step)

Labels already exist in the DB: ratings (explicit 0-10), check-ins (went there), wishlist
(wants to go). A `scripts/export-training-data.ts` that writes `(context, place, label)`
rows as JSONL is the natural next step. TODO(P1).
