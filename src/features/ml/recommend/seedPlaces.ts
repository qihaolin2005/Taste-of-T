// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// The offline restaurant list (data/seed-restaurants.json). Used when no live source is given,
// and as the fallback when the live source fails (see source.ts).
// Entries that don't match restaurantSchema are skipped (and counted), never guessed at.
import seedFile from "../../../../data/seed-restaurants.json";
import { restaurantSchema, type RestaurantCandidate } from "./restaurant";

/** Keep entries that match restaurantSchema (extra fields like hours are dropped); count the rest. */
export function validateRestaurants(list: readonly unknown[]): { places: RestaurantCandidate[]; skipped: number } {
  const places: RestaurantCandidate[] = [];
  let skipped = 0;
  for (const entry of list) {
    const parsed = restaurantSchema.safeParse(entry);
    if (parsed.success) places.push(parsed.data);
    else skipped++;
  }
  return { places, skipped };
}

export function loadSeedRestaurants(raw: unknown = seedFile): { places: RestaurantCandidate[]; skipped: number } {
  const list = (raw as { places?: unknown })?.places;
  return Array.isArray(list) ? validateRestaurants(list) : { places: [], skipped: 0 };
}
