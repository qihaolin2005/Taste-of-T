# Restaurant source: what the ML needs from the places client

**For:** whoever builds the restaurant data and endpoint (P2, `src/lib/places`).
**From:** ML (P1). The ML side is ready and only waits on one function from you.

> **Status (P2):** implemented. `listRestaurants` is exported from `@/lib/places` (Google Places
> API (New), see `src/lib/places/README.md`) and already wired into
> `/api/me/recommendations`. The squad `start` route still needs its one-line hookup (step 2).
> One deviation: `data/seed-restaurants.json` is hand-written demo data, **not** a Google
> snapshot, because Google's terms forbid storing Places content (place ids excepted).
> Note for P1: activities carry a full `dietary` list in the seed so restricted users still see
> them; consider skipping the diet filter for `category: "activity"` instead.

## The one function to provide

```ts
// src/lib/places (your code), exported from its index
import type { RestaurantSource } from "@/features/ml";

export const listRestaurants: RestaurantSource = async ({ signal }) => {
  // fetch / read your data; pass `signal` to fetch() so a slow call can be cancelled
  return restaurants; // array of records in the shape below
};
```

- **Signature:** `(opts: { signal: AbortSignal }) => Promise<unknown[]>`.
- **Returns:** every restaurant the app should know about (Boston, a few hundred at most). The
  recommenders do their own filtering by distance, city, diet and taste, so don't pre-filter.
- **Server-side only:** it's called from route handlers, not the browser.

## Plugging it in (one line each, after your client is merged)

1. **Solo "for you" list:** in `src/app/api/me/recommendations/route.ts`, set
   ```ts
   import { listRestaurants } from "@/lib/places";
   const RESTAURANT_SOURCE: RestaurantSource | null = listRestaurants;
   ```
2. **Squad shortlist:** the room `start` route (P3) does
   ```ts
   const { places } = await loadRestaurants(listRestaurants);
   await startAdventure(db, roomId, userId, { places });
   ```

`loadRestaurants` (from `@/features/ml`) is the same safety wrapper the solo route uses.

## What happens if your source misbehaves

You don't need to handle this; the ML side already does:

| Your function... | Result |
|---|---|
| returns valid records | used (`restaurantsFrom: "source"` in the API response) |
| includes some invalid records | those are skipped and counted in a warning; the rest are used |
| throws (quota, network, no API key) | the offline `data/seed-restaurants.json` is used, plus a warning |
| takes longer than 3 s | cancelled through `signal`; seed list is used |
| returns `[]` or nothing valid | seed list is used |

**Please also save a snapshot to `data/seed-restaurants.json`** (format: `{ "places": [ ... ] }`,
same records). That's what the app falls back to, and the team rule is that everything works
with an empty `.env`. A script like `scripts/fetch-stations.ts`, which does this for MBTA, is the
model to follow.

## Record shape

Validated against `restaurantSchema` in `src/features/ml/recommend/restaurant.ts`. Unknown
fields (hours, address, phone, a Google place id…) are fine; they're ignored.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string ≤ 100 | ✅ | Stable: ratings, wishlist and swipes are stored by this id. Don't change it between fetches. |
| `category` | `"dinner"`, `"dessert"` or `"activity"` | ✅ | |
| `tags` | string[] | ✅ | Free tags; used as cuisines if `cuisines` is missing |
| `pricePerPerson` | number (USD) | ✅ | |
| `stationId` | string | ✅ | Nearest T station id from `data/stations.json`, e.g. `"place-coecl"`. Used for distance if `lat`/`lng` are missing. |
| `name` | string | strongly recommended | Shown in the app |
| `lat`, `lng` | number | strongly recommended | Distance and "nearby" |
| `city` | string, e.g. `"Boston"` | **needed for squads** | Places without a city never appear in squad shortlists |
| `neighborhood` | string, e.g. `"Back Bay"` | recommended | "I'm heading to Back Bay" mode |
| `cuisines` | string[] from the list below | recommended | Taste matching and variety. Values outside the list are ignored for matching. |
| `rating` | 0–5 | recommended | Missing = treated as average (3.8★) |
| `reviewCount` | integer | recommended | A 5★ place with 3 reviews counts less than 4.6★ with 1,500 |
| `priceLevel` | 1–4 | optional | Estimated from `pricePerPerson` if missing |
| `dietStyle` | `"veg-only"`, `"vegan-only"`, `"non-veg-only"` or `"mixed"` | **see below** | |
| `dietary` | string[] from the list below | **see below** | Needs the place can serve |

### Dietary info decides who can see a place

The dietary filter is strict: **a place with no `dietary` list and no `dietStyle` is never shown to
anyone with a dietary restriction**, and many users will have one, since onboarding asks for them.
Google Places doesn't reliably say whether a place is vegan or halal, so these usually need
another source or filling in by hand.

- Vegetarian users need `dietStyle: "veg-only"` or `"vegan-only"`, or `"vegetarian"` or `"vegan"` in `dietary`
- Vegan users need `dietStyle: "vegan-only"` or `"vegan"` in `dietary`
- Everything else (halal, kosher, gluten-free…) must be listed in `dietary`
- `"non-veg-only"` is never shown to vegetarians or vegans, whatever `dietary` says

### Allowed values

`cuisines` (from `TASTE_VOCAB` in `src/features/ml/vocab.ts`):
american, bakery, bbq, boba, brunch, burgers, cafe, chinese, dessert, dim-sum, dumplings, hot-pot,
ice-cream, indian, italian, japanese, korean, late-night, mediterranean, mexican, noodles, pizza,
ramen, sandwiches, seafood, spicy, sushi, tacos, thai, vegan-friendly, vietnamese (activities:
arcade, bowling, comedy, karaoke, live-music, museum, outdoors). Need a new one? Tell P1: the list
can only be appended to.

`dietary` (from `DIETARY_VOCAB`): vegetarian, vegan, halal, kosher, gluten-free, dairy-free, nut-free.

### Example record

```json
{
  "id": "seed-bb-thai-1",
  "name": "Demo Thai Kitchen",
  "category": "dinner",
  "tags": ["thai", "spicy"],
  "cuisines": ["thai", "spicy"],
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

## How to check your data

- **Solo list:** call `POST /api/me/recommendations` with an empty body while signed in.
  `restaurantsFrom` should be `"source"`, `results` non-empty, and `warnings` should list any
  skipped records.
- **Dietary coverage:** set your own dietary restriction to vegan in onboarding and check that
  you still get results.
