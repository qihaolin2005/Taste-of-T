# Proposal for P2: data the recommenders need

**From:** P1 / ML. **Status:** proposal, nothing in `prisma/` or `data/` has been changed.

The individual and group recommenders (`src/features/ml/recommend/`) already work
with what exists today, but several inputs are missing. Until they land, the recommenders
treat each missing field as "unknown" (listed below for each field), so nothing breaks.

## 1. `Swipe` (new table)

There's no swipe data anywhere yet. Today preference is derived from ratings, wishlist and
check-ins. Swipes are the main signal for both recommenders and should be stored as they happen.

```prisma
/// One right/left swipe on a place, solo or inside a group session (room).
model Swipe {
  id        String   @id @default(cuid())
  userId    String?  // null for a room member without an account
  user      User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  memberId  String?  // RoomMember.id, set for group swipes
  roomId    String?  // set for group swipes
  room      Room?    @relation(fields: [roomId], references: [id], onDelete: Cascade)
  placeId   String   // id from the places client (not a FK, like Rating.placeId)
  liked     Boolean
  source    String   // "solo" | "group"
  createdAt DateTime @default(now())

  @@unique([roomId, memberId, placeId]) // one vote per member per place per session; re-swipe = update
  @@index([userId, createdAt])
  @@index([roomId])
}
```

Plus the back-relations: `swipes Swipe[]` on `User` and `Room`.

This maps 1:1 to the `Swipe` type in `recommend/interactions.ts` and to `GroupVote` in
`recommend/group.ts`:

| Column | Recommender field |
|---|---|
| `placeId`, `liked` | `placeId`, `liked` |
| `source` | `source` |
| `createdAt` | `at` (epoch ms, used only for recency order) |
| `roomId` | `sessionId` |
| `memberId` | `GroupVote.memberId` |

**Group deck.** The deck shown to a room should be stored so every member swipes the same
cards and the ranking can use pre-swipe group scores. The simplest option is a JSON column on
`Room`, matching how `Plan.result` is stored:

```prisma
model Room {
  // ...existing fields
  deck Json? // GroupDeck from buildGroupDeck(): place ids, group scores, explore flags
}
```

## 2. User city

`buildGroupDeck` filters candidates by the members' city. Neither users nor room members
have a city today. Proposal:

```prisma
model UserPreferences {
  // ...existing fields
  city String? // e.g. "Boston"; set at signup
}

model RoomMember {
  // ...existing fields
  city String? // copied from preferences at join time, like dietary
}
```

**Until then:** the caller can pass `city` explicitly. With no city at all, the group
recommender skips the filter and returns a warning.

## 3. Restaurant fields

Restaurants aren't in the DB (`data/seed-restaurants.json` plus the places client), so these
belong in the seed JSON and the shared `Place` type in `src/types/index.ts`, not in Prisma. The
recommenders read them through `RestaurantCandidate` (`recommend/restaurant.ts`), which extends
the existing `CandidatePlace`.

| Field | Type | Needed for | If missing |
|---|---|---|---|
| `lat`, `lng` | number | Nearby radius, distance score, destination center | Uses the place's station coordinates |
| `city` | string | Group city filter | **Excluded** when a city filter is on |
| `neighborhood` | string | Destination mode ("heading to Back Bay") | Only matched by distance from a given center |
| `cuisines` | string[] (from `TASTE_VOCAB`) | Content vector, MMR diversity, reasons | Uses `tags` |
| `priceLevel` | 1-4 | Content vector | Estimated from `pricePerPerson` |
| `rating` | 0-5 | Quality score | Prior mean (3.8) |
| `reviewCount` | int | Weighting the rating (Bayesian shrinkage) | Rating shrunk fully to the prior |
| `dietStyle` | `"veg-only" \| "vegan-only" \| "non-veg-only" \| "mixed"` | Dietary filter | See below |
| `dietary` | string[]: needs the place can serve (`"vegetarian"`, `"vegan"`, `"halal"`, …) | Dietary filter | **Unsupported** for every restriction |

**Dietary is a hard filter, and unknown means "no".** A place with no `dietary` list and no
`dietStyle` will never be shown to a vegetarian, vegan, halal, etc. user. Please fill these for
every seed place, including `dietary: []` (confirmed nothing) vs. leaving it out (unknown).
They're treated the same today, but the difference is useful for the data audit.

Example seed entry:

```json
{
  "id": "seed-bb-thai-1",
  "name": "Demo Thai Kitchen",
  "category": "dinner",
  "tags": ["thai", "spicy"],
  "cuisines": ["thai"],
  "pricePerPerson": 22,
  "priceLevel": 2,
  "stationId": "place-coecl",
  "lat": 42.3502,
  "lng": -71.0765,
  "city": "Boston",
  "neighborhood": "Back Bay",
  "rating": 4.5,
  "reviewCount": 800,
  "dietStyle": "mixed",
  "dietary": ["vegetarian", "vegan"]
}
```

## 4. Check-in place ids (done on the ML side)

`UserContext.history.checkInPlaceIds` (distinct, most recent first, max 50) was added in
`src/features/ml/context.ts`. It reads the existing `CheckIn.placeId` column, so no schema
change is needed. Check-ins only count as a signal when `placeId` is set, so please set it
whenever a check-in is tied to a restaurant.
