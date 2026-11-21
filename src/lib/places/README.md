# Places: restaurants and activities (Google Places API (New))

```ts
import { listRestaurants, searchPlaces, isOpenFor } from "@/lib/places";   // server only

await searchPlaces({ stationId: "place-chncl", category: "dinner" });        // near a station
await searchPlaces({ stationId: "place-harsq", text: "boba" });              // free text
const places = await listRestaurants({ signal });                            // all hubs (ML source)
isOpenFor(place.hours, dayOfWeek, minutesAfterMidnight, stayMinutes);        // planner check
```

- **With `PLACES_API_KEY`:** live Google data. `listRestaurants` searches around each food hub in
  `hubs.ts` (Chinatown, Downtown, North End, Back Bay, Fenway, Kendall, Central, Harvard,
  Davis) for dinner, dessert, and activities, then merges the results.
- **Without a key, or if Google fails:** the demo list in `data/seed-restaurants.json`, plus a
  `warning` explaining why. The app works with an empty `.env`.
- Every place follows the ML `restaurantSchema` (docs/restaurant-source.md), plus `hours`,
  `walkMinutes`, `address`, and `mapsUrl`. Google places get ids like `google:ChIJ...`, which
  are stable, so ratings and wishlists keep working across fetches.

## Setup

1. Google Cloud Console (same project as the Maps key) → **APIs & Services → Library** →
   enable **Places API (New)**.
2. **Credentials → Create credentials → API key.** Restrict it: **API restrictions → Places API
   (New)** only; **Application restrictions → None** (or your server's IP). Don't reuse the browser
   Maps key: that one is public, and referrer-restricted keys don't work from a server.
3. Add `PLACES_API_KEY=...` to `.env` and restart.
4. Check it: signed in, open `/api/restaurants?station=place-chncl&category=dinner`. It should
   say `"from": "google"`.

## Cost

Google bills per request, at the tier of the most expensive field requested (`FIELD_MASK` in
`google.ts`). We need rating, price, and hours (Enterprise) and `servesVegetarianFood`
(Enterprise + Atmosphere), so every request is billed at that tier. Each SKU has a monthly free
allowance; check the current numbers on the Places pricing page. To keep usage low:

- Results are cached in memory for `PLACES_CACHE_TTL_MIN` minutes (default 60).
- A full `listRestaurants` refresh is 27 requests (9 hubs × 3 categories). Add hubs carefully.
- `/api/restaurants` is signed-in only and rate limited (60 searches/hour per user).
- Set a **budget alert** in Google Cloud Billing.

## Google's terms: don't store their data

Google Places content may not be saved to our DB or files (place ids are the exception). So:

- Live results live **in memory only**, for the cache TTL.
- `data/seed-restaurants.json` is **hand-written demo data** (fictional places), not a Google
  snapshot. Regenerating it from Google would break the terms.

## What Google doesn't tell us

Diets: only `servesVegetarianFood` and vegan/vegetarian restaurant types. Nothing about halal,
kosher, gluten-free, or allergies, so those stay unknown. The ML filter hides places with
unknown diet info from people with that restriction, so they'll see fewer Google results.
Filling that gap needs another source or a small hand-curated list. TODO(P2).
