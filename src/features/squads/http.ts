// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Shared Route Handler bits for the squad session routes (/api/rooms/[code]/start|swipes|session|end|plan).
import { apiError } from "@/lib/api";
import { googlePlacesEnabled, listRestaurants } from "@/lib/places";
import { loadRestaurants, type RestaurantSource } from "@/features/ml";
import { normalizeCode } from "@/features/rooms";
import { SquadSessionError } from "./service";

/** "bhsg" -> "BHSG", or a ready 404 when it can't be a room code. */
export function roomCodeOr404(raw: string): { code: string } | { response: Response } {
  const code = normalizeCode(raw);
  return code ? { code } : { response: apiError("not_found", "No group with that code.") };
}

/** Map squad session errors to HTTP responses; rethrow anything unexpected. */
export function squadErrorResponse(err: unknown): Response {
  if (err instanceof SquadSessionError) return apiError(err.code, err.message);
  throw err;
}

/** Restaurants for a squad shortlist: live Google Places when configured, else the seed list. */
export async function squadPlaces() {
  const source: RestaurantSource | null = googlePlacesEnabled() ? listRestaurants : null;
  return (await loadRestaurants(source)).places;
}
