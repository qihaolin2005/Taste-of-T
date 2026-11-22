// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Dietary filter. Runs BEFORE any scoring; a model can never bring back a place it removed.
//
// Each place gets a fit for each restriction: "yes" (the data says so), "likely", "maybe", or
// "no". Our data is thin: Google only says "serves vegetarian food" and "vegan restaurant", so a
// strict yes-only rule left a vegan with a couple of vegan restaurants. Most ordinary menus do
// have something for them, so:
//  - vegetarian / vegan (config.dietary.softNeeds) are soft:
//      no:     the place is "non-veg-only" (always wins, even over a contradictory list)
//      yes:    listed, or a veg-only / vegan-only menu
//      likely: vegetarian - any other place, unless its food is meat-centric (BBQ, seafood);
//              vegan - a vegetarian menu, or vegetarian options at a cuisine with lots of
//              plant-based dishes (Indian, Thai, Mediterranean, ...)
//      maybe:  everything else that isn't "no"
//    "yes" and "likely" places are always eligible; "maybe" ones only when fewer than
//    config.dietary.minPool places are left. Lower fits score a little less and their reason says
//    to check the menu.
//  - Everything else (halal, kosher, gluten-free, dairy-free, nut-free) stays strict: religious
//    rules and allergies, so only "yes" (the place lists it) passes.
// Groups use the union of every member's restrictions (one vegetarian + one vegan -> both); a
// place's fit is its worst fit across them.
// Activities (config.categories.dietFree) skip the filter: nobody eats at a bowling alley.
import { RECOMMENDER_CONFIG, type RecommenderConfig } from "./config";
import { cuisinesOf, type RestaurantCandidate } from "./restaurant";

export type DietFit = "yes" | "likely" | "maybe" | "no";
const RANK: Record<DietFit, number> = { no: 0, maybe: 1, likely: 2, yes: 3 };
const worst = (a: DietFit, b: DietFit): DietFit => (RANK[a] <= RANK[b] ? a : b);

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

/** How well one place fits one restriction. */
export function fitFor(place: RestaurantCandidate, need: string, cfg: RecommenderConfig = RECOMMENDER_CONFIG): DietFit {
  const listed = new Set(normalizeDietary(place.dietary));
  const style = place.dietStyle;
  const tags = cuisinesOf(place);

  if (need === "vegetarian" || need === "vegan") {
    if (style === "non-veg-only") return "no";
    const vegan = style === "vegan-only" || listed.has("vegan");
    const vegetarian = vegan || style === "veg-only" || listed.has("vegetarian");
    if (!cfg.dietary.softNeeds.includes(need)) return (need === "vegan" ? vegan : vegetarian) ? "yes" : "no";
    if (need === "vegetarian") {
      if (vegetarian) return "yes";
      return tags.length && tags.every((t) => cfg.dietary.meatCentric.includes(t)) ? "maybe" : "likely";
    }
    if (vegan) return "yes";
    if (style === "veg-only" || tags.includes("vegan-friendly")) return "likely";
    if (vegetarian && tags.some((t) => cfg.dietary.plantForward.includes(t))) return "likely";
    return "maybe";
  }
  return listed.has(need) ? "yes" : "no";
}

/** A place's fit for all of these restrictions: the worst one. Activities always fit. */
export function dietFit(place: RestaurantCandidate, needs: readonly string[], cfg: RecommenderConfig = RECOMMENDER_CONFIG): DietFit {
  if (isDietFree(place)) return "yes";
  return normalizeDietary(needs).reduce<DietFit>((acc, n) => worst(acc, fitFor(place, n, cfg)), "yes");
}

/** Confirmed fit: every restriction is a "yes". The strict check (feature flags, tests). */
export function checkDietary(place: RestaurantCandidate, needs: readonly string[]): DietaryCheck {
  if (isDietFree(place)) return { ok: true };
  const failed = normalizeDietary(needs).filter((n) => fitFor(place, n) !== "yes");
  return failed.length ? { ok: false, failed } : { ok: true };
}

export function passesDietary(place: RestaurantCandidate, needs: readonly string[]): boolean {
  return checkDietary(place, needs).ok;
}

/** Strict: only places confirmed for every restriction. */
export function filterByDietary<T extends RestaurantCandidate>(places: readonly T[], needs: readonly string[]): T[] {
  const n = normalizeDietary(needs);
  return n.length ? places.filter((p) => passesDietary(p, n)) : [...places];
}

export type DietarySelection<T> = {
  kept: T[];
  /** Fit of each kept place, by id. */
  fit: Map<string, DietFit>;
  /** True when "maybe" places were let in because too few others were left. */
  usedMaybe: boolean;
};

/**
 * The places these restrictions allow: never a "no"; "yes" and "likely" always; "maybe" only
 * when fewer than config.dietary.minPool places are left without them.
 */
export function selectByDietary<T extends RestaurantCandidate>(
  places: readonly T[],
  needs: readonly string[],
  cfg: RecommenderConfig = RECOMMENDER_CONFIG,
): DietarySelection<T> {
  const n = normalizeDietary(needs);
  const fit = new Map<string, DietFit>();
  const rated = places.map((p) => ({ p, f: n.length ? dietFit(p, n, cfg) : ("yes" as DietFit) }));
  const good = rated.filter((x) => x.f === "yes" || x.f === "likely");
  const maybe = rated.filter((x) => x.f === "maybe");
  const usedMaybe = good.length < cfg.dietary.minPool && maybe.length > 0;
  const kept = usedMaybe ? [...good, ...maybe] : good;
  for (const x of kept) fit.set(x.p.id, x.f);
  // Keep the input order.
  const keep = new Set(kept.map((x) => x.p));
  return { kept: places.filter((p) => keep.has(p)), fit, usedMaybe };
}

/** Score multiplier for a fit (config.dietary.fitWeight). */
export const fitWeight = (f: DietFit | undefined, cfg: RecommenderConfig = RECOMMENDER_CONFIG): number =>
  f == null || f === "no" ? 1 : cfg.dietary.fitWeight[f];

/** Human labels for how a place handles these needs, for result reasons. */
export function dietaryHighlights(place: RestaurantCandidate, needs: readonly string[], cfg: RecommenderConfig = RECOMMENDER_CONFIG): string[] {
  if (isDietFree(place)) return [];
  const out: string[] = [];
  const unsure: string[] = [];
  let list = normalizeDietary(needs);
  // Vegan options are vegetarian too: don't say both.
  if (list.includes("vegan") && list.includes("vegetarian") && RANK[fitFor(place, "vegan", cfg)] >= RANK[fitFor(place, "vegetarian", cfg)])
    list = list.filter((n) => n !== "vegetarian");
  for (const n of list) {
    const f = fitFor(place, n, cfg);
    const veg = n === "vegetarian" || n === "vegan";
    if (f === "yes") out.push(veg ? `has ${n} options` : n);
    else if (f === "likely") out.push(`likely has ${n} options`);
    else if (f === "maybe") unsure.push(n);
  }
  if (unsure.length) out.push(`check the menu for ${unsure.join(" and ")} options`);
  return out;
}
