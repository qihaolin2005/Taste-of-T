// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Fallback restaurant list from data/seed-restaurants.json, for when the caller has no candidates.
// TODO(P2): replace with the places client (src/lib/places) once it exists.
// Entries that don't match restaurantSchema are skipped (and counted), never guessed at.
import seedFile from "../../../../data/seed-restaurants.json";
import { restaurantSchema, type RestaurantCandidate } from "./restaurant";

export function loadSeedRestaurants(raw: unknown = seedFile): { places: RestaurantCandidate[]; skipped: number } {
  const list = (raw as { places?: unknown })?.places;
  if (!Array.isArray(list)) return { places: [], skipped: 0 };
  const places: RestaurantCandidate[] = [];
  let skipped = 0;
  for (const entry of list) {
    // Seed entries may carry extra fields (hours, address...); keep only what the recommender knows.
    const parsed = restaurantSchema.safeParse(entry);
    if (parsed.success) places.push(parsed.data);
    else skipped++;
  }
  return { places, skipped };
}
