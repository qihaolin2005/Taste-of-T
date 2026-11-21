// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Strict dietary filter. Runs BEFORE any scoring; a model can never override it.
//
// Rules for each restriction a person has:
//  - vegetarian: place must not be "non-veg-only", AND must have vegetarian options
//    (dietary includes "vegetarian" or "vegan", or dietStyle is veg-only / vegan-only).
//  - vegan:      place must not be "non-veg-only", AND must have vegan options
//    (dietary includes "vegan", or dietStyle is vegan-only).
//  - anything else (halal, kosher, gluten-free, ...): dietary must list it explicitly.
//  - Unknown dietary info (dietary undefined and no dietStyle that answers it) = NOT supported.
// Groups use the union of every member's restrictions (one vegetarian + one vegan -> both).
// Activities (config.categories.dietFree) skip the filter: nobody eats at a bowling alley.
import { RECOMMENDER_CONFIG } from "./config";
import type { RestaurantCandidate } from "./restaurant";

/** True for kinds of place the dietary filter doesn't apply to (activities). */
export function isDietFree(place: RestaurantCandidate): boolean {
  return RECOMMENDER_CONFIG.categories.dietFree.includes(place.category);
}

export type DietaryCheck = { ok: true } | { ok: false; failed: string[] };

/** Lowercase, trim, de-duplicate, drop empties. */
export function normalizeDietary(needs: readonly string[] | null | undefined): string[] {
  return [...new Set((needs ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean))];
}

/** Union of everyone's restrictions. */
export function unionDietary(lists: readonly (readonly string[] | null | undefined)[]): string[] {
  return normalizeDietary(lists.flatMap((l) => l ?? []));
}

function supports(place: RestaurantCandidate, need: string): boolean {
  const listed = new Set(normalizeDietary(place.dietary));
  const style = place.dietStyle;

  if (need === "vegetarian" || need === "vegan") {
    if (style === "non-veg-only") return false; // wins over a contradictory dietary list
    if (need === "vegan") return style === "vegan-only" || listed.has("vegan");
    return style === "veg-only" || style === "vegan-only" || listed.has("vegetarian") || listed.has("vegan");
  }
  return listed.has(need);
}

export function checkDietary(place: RestaurantCandidate, needs: readonly string[]): DietaryCheck {
  if (isDietFree(place)) return { ok: true };
  const failed = normalizeDietary(needs).filter((n) => !supports(place, n));
  return failed.length ? { ok: false, failed } : { ok: true };
}

export function passesDietary(place: RestaurantCandidate, needs: readonly string[]): boolean {
  return checkDietary(place, needs).ok;
}

export function filterByDietary<T extends RestaurantCandidate>(places: readonly T[], needs: readonly string[]): T[] {
  const n = normalizeDietary(needs);
  return n.length ? places.filter((p) => passesDietary(p, n)) : [...places];
}

/** Human labels for the needs a place satisfies, for result reasons. */
export function dietaryHighlights(place: RestaurantCandidate, needs: readonly string[]): string[] {
  if (isDietFree(place)) return [];
  return normalizeDietary(needs)
    .filter((n) => supports(place, n))
    .map((n) => (n === "vegetarian" || n === "vegan" ? `has ${n} options` : `${n}`));
}
