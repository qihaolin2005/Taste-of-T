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
| `preferences.dietary` | preferences / join form | `vegetarian`, `vegan`, `halal`, `kosher`, `gluten-free`, … **Hard constraint.** |
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

To try it without the planner: `POST /api/me/recommendations` with `{ "candidates": [...] }`.

## Rules for model code

- **Dietary needs are hard constraints.** Return `null` for places that can't serve them.
- The context includes coarse location. Only send it to a model service **we run**, never
  to a third-party API.
- Beat `baselineModel` on held-out data before switching the default; it's the benchmark.

## Training data (next step)

Labels already exist in the DB: ratings (explicit 0-10), check-ins (went there), wishlist
(wants to go). A `scripts/export-training-data.ts` that writes `(context, place, label)`
rows as JSONL is the natural next step. TODO(P1).
