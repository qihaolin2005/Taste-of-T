// Owner: P2 - Data & Integrations (see TEAM.md)
// Where the app gets restaurants and activities.
//
//   listRestaurants   -> RestaurantSource for the ML recommenders (docs/restaurant-source.md):
//                        Google results around every food hub, merged and de-duplicated.
//   searchPlaces(q)   -> search around one station (category and/or free text), for the
//                        planner and GET /api/restaurants.
//
// Both use Google Places when PLACES_API_KEY is set and fall back to the offline seed list
// (data/seed-restaurants.json) when it isn't, or when Google fails. Results are cached in
// memory for PLACES_CACHE_TTL_MIN (default 60) minutes to keep cost and latency down.
import { getStation, getStations } from "@/lib/mbta/stations";
import type { RestaurantSource } from "@/features/ml/recommend/source";
import { TtlCache } from "./cache";
import { placesApiKey, PlacesUnavailableError, searchNearby, searchText } from "./google";
import { mapGooglePlace } from "./googleMapping";
import { CATEGORY_TYPES, HUB_RADIUS_M, HUBS } from "./hubs";
import { getSeedPlaces, searchSeed } from "./seedClient";
import type { Place, PlaceCategory, PlaceQuery, PlaceResults } from "./types";

const ttlMs = () => (Number(process.env.PLACES_CACHE_TTL_MIN) || 60) * 60_000;
const cache = new TtlCache<Place[]>(ttlMs());
const CATEGORIES: PlaceCategory[] = ["dinner", "dessert", "activity"];

export const googlePlacesEnabled = () => placesApiKey() !== null;

/** One Google Nearby Search around a hub, mapped to Places. */
async function fetchHub(hubIndex: number, category: PlaceCategory): Promise<Place[]> {
  const hub = HUBS[hubIndex];
  const station = getStation(hub.stationId);
  if (!station) return [];
  const raw = await searchNearby({ center: station, radiusM: HUB_RADIUS_M, includedTypes: CATEGORY_TYPES[category] });
  const stations = getStations();
  return raw.map((g) => mapGooglePlace(g, { stations, categoryHint: category, hub })).filter((p): p is Place => p !== null);
}

/** Merge results from many searches; the same place can show up around two hubs. */
function dedupe(lists: Place[][]): Place[] {
  const byId = new Map<string, Place>();
  for (const p of lists.flat()) if (!byId.has(p.id) || (p.walkMinutes < byId.get(p.id)!.walkMinutes)) byId.set(p.id, p);
  return [...byId.values()];
}

/**
 * Everything around every hub. Individual hub failures are tolerated (we keep the rest);
 * if every request fails, the error propagates so callers fall back to the seed list.
 */
async function fetchAllHubs(): Promise<Place[]> {
  const jobs = HUBS.flatMap((_, i) => CATEGORIES.map((c) => fetchHub(i, c)));
  const settled = await Promise.allSettled(jobs);
  const ok = settled.filter((s): s is PromiseFulfilledResult<Place[]> => s.status === "fulfilled").map((s) => s.value);
  if (!ok.length) {
    const first = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
    throw first?.reason ?? new PlacesUnavailableError("No results from Google Places");
  }
  return dedupe(ok);
}

/**
 * RestaurantSource for the ML side. The first call after a cold start makes ~27 Google requests
 * and may take longer than the recommender's 3 s budget: in that case `signal` aborts our wait,
 * the caller uses the seed list once, and the fetch keeps running in the background so the next
 * call is served from cache.
 */
export const listRestaurants: RestaurantSource = async ({ signal }) => {
  if (!googlePlacesEnabled()) throw new PlacesUnavailableError("PLACES_API_KEY isn't set");
  const pending = cache.get("all-hubs", fetchAllHubs);
  pending.catch(() => {}); // a background failure shouldn't be an unhandled rejection
  return await new Promise<Place[]>((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    signal.addEventListener("abort", () => reject(new Error("still loading from Google; using the offline list for now")), { once: true });
    pending.then(resolve, reject);
  });
};

/** Search around one station. Never throws: falls back to the seed list with a warning. */
export async function searchPlaces(q: PlaceQuery): Promise<PlaceResults> {
  const station = getStation(q.stationId);
  if (!station) return { places: [], from: "seed", warning: `Unknown station ${q.stationId}` };
  if (!googlePlacesEnabled()) return { places: searchSeed(q), from: "seed", warning: "PLACES_API_KEY isn't set; showing demo places." };

  const radiusM = q.radiusM ?? 800;
  const text = q.text?.trim();
  const key = JSON.stringify([q.stationId, q.category ?? "", text ?? "", radiusM]);
  try {
    const places = await cache.get(key, async () => {
      const stations = getStations();
      const raw = text
        ? await searchText({ center: station, radiusM, query: q.category && q.category !== "dinner" ? `${text} ${q.category}` : text })
        : await searchNearby({ center: station, radiusM, includedTypes: CATEGORY_TYPES[q.category ?? "dinner"] });
      return raw.map((g) => mapGooglePlace(g, { stations, categoryHint: q.category })).filter((p): p is Place => p !== null);
    });
    const filtered = places.filter((p) => !q.category || p.category === q.category).slice(0, q.limit ?? 20);
    return { places: filtered, from: "google" };
  } catch (err) {
    return { places: searchSeed(q), from: "seed", warning: `${(err as Error).message}; showing demo places.` };
  }
}

/** For tests. */
export function clearPlacesCache() {
  cache.clear();
}

export { getSeedPlaces };
