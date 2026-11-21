// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Where the recommenders get restaurants from.
//
// A RestaurantSource is any async function that returns restaurants in RestaurantCandidate
// shape (restaurant.ts). The places client (src/lib/places, P2) provides the real one; until
// then, and whenever it fails, we use the offline seed list. Contract: docs/restaurant-source.md
//
//   const { places, warnings } = await loadRestaurants(listRestaurants);   // P2's function
//
// Rules, so the demo never breaks:
//  - Every record is validated against restaurantSchema; invalid ones are skipped and counted.
//  - If the source throws, times out, or returns nothing valid -> seed list + a warning.
import { loadSeedRestaurants, validateRestaurants } from "./seedPlaces";
import type { RestaurantCandidate } from "./restaurant";

export type RestaurantSource = (opts: { signal: AbortSignal }) => Promise<readonly unknown[]>;

export type LoadedRestaurants = {
  places: RestaurantCandidate[];
  /** Where the places came from. */
  from: "source" | "seed";
  /** Records dropped because they didn't match restaurantSchema. */
  skipped: number;
  warnings: string[];
};

export const RESTAURANT_SOURCE_TIMEOUT_MS = 3000;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function fromSeed(seed: () => { places: RestaurantCandidate[]; skipped: number }, warnings: string[]): LoadedRestaurants {
  const s = seed();
  if (s.skipped) warnings.push(`Skipped ${plural(s.skipped, "seed restaurant")} with invalid data.`);
  if (!s.places.length) warnings.push("No restaurants available yet: data/seed-restaurants.json is empty.");
  return { places: s.places, from: "seed", skipped: s.skipped, warnings };
}

export async function loadRestaurants(
  source?: RestaurantSource | null,
  opts: { timeoutMs?: number; seed?: () => { places: RestaurantCandidate[]; skipped: number } } = {},
): Promise<LoadedRestaurants> {
  const seed = opts.seed ?? (() => loadSeedRestaurants());
  if (!source) return fromSeed(seed, []);

  const timeoutMs = opts.timeoutMs ?? RESTAURANT_SOURCE_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      source({ signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`timed out after ${timeoutMs} ms`));
        }, timeoutMs);
      }),
    ]);
    if (!Array.isArray(raw)) throw new Error("did not return a list");
    const { places, skipped } = validateRestaurants(raw);
    const warnings = skipped ? [`Skipped ${plural(skipped, "restaurant")} from the restaurant source with invalid data.`] : [];
    if (!places.length) return fromSeed(seed, [...warnings, "The restaurant source returned no usable restaurants; using the offline list."]);
    return { places, from: "source", skipped, warnings };
  } catch (err) {
    return fromSeed(seed, [`The restaurant source failed (${(err as Error).message}); using the offline list.`]);
  } finally {
    clearTimeout(timer);
  }
}
