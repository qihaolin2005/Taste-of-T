// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Fixed vocabularies for one-hot features. ORDER MATTERS: a trained model depends on it.
// Only append to these lists; if you remove or reorder, bump FEATURE_VERSION in features.ts.

/** Cuisine / vibe tags. Match the tags used in data/seed-restaurants.json. */
export const TASTE_VOCAB = [
  "american", "bakery", "bbq", "boba", "brunch", "burgers", "cafe", "chinese", "dessert",
  "dim-sum", "dumplings", "hot-pot", "ice-cream", "indian", "italian", "japanese", "korean",
  "late-night", "mediterranean", "mexican", "noodles", "pizza", "ramen", "sandwiches",
  "seafood", "spicy", "sushi", "tacos", "thai", "vegan-friendly", "vietnamese",
  // activities
  "arcade", "bowling", "comedy", "karaoke", "live-music", "museum", "outdoors",
] as const;

/** Dietary needs. Treated as HARD constraints by the baseline model. */
export const DIETARY_VOCAB = ["vegetarian", "vegan", "halal", "kosher", "gluten-free", "dairy-free", "nut-free"] as const;

/** Line families riders think in (Green-B..E are all "Green"). */
export const LINE_FAMILIES = ["Red", "Orange", "Blue", "Green", "Mattapan"] as const;
export type LineFamily = (typeof LINE_FAMILIES)[number];

export function lineFamily(routeId: string): LineFamily | null {
  const id = routeId.startsWith("Green") ? "Green" : routeId;
  return (LINE_FAMILIES as readonly string[]).includes(id) ? (id as LineFamily) : null;
}
