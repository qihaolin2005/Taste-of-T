// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Food choices shared by onboarding (OnboardingForm) and Profile > Food & Diet (FoodPreferences),
// so both always offer the same options.
import type { DietaryNeed } from "@/lib/identity";

/** Figma cuisine chips -> recommender taste tags (src/features/ml/vocab.ts TASTE_VOCAB). */
export const CUISINES: { value: string; label: string; tags: string[] }[] = [
  { value: "italian", label: "Italian", tags: ["italian"] },
  { value: "japanese", label: "Japanese", tags: ["japanese"] },
  { value: "korean", label: "Korean", tags: ["korean"] },
  { value: "chinese", label: "Chinese", tags: ["chinese"] },
  { value: "thai", label: "Thai", tags: ["thai"] },
  { value: "mexican", label: "Mexican", tags: ["mexican"] },
  { value: "mediterranean", label: "Mediterranean", tags: ["mediterranean"] },
  { value: "american", label: "American", tags: ["american"] },
  { value: "indian", label: "Indian", tags: ["indian"] },
  { value: "bakery", label: "Bakery & Desserts", tags: ["bakery", "dessert"] },
  { value: "cafe", label: "Coffee & Tea", tags: ["cafe", "boba"] },
  { value: "any", label: "Open to Anything", tags: [] },
];

/** Figma dietary chips. Values are the backend's fixed DIETARY_VOCAB, plus an exclusive "none". */
export const DIETARY: { value: DietaryNeed | "none"; label: string }[] = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
  { value: "gluten-free", label: "Gluten-free" },
  { value: "dairy-free", label: "Dairy-free" },
  { value: "nut-free", label: "Nut allergy" },
  { value: "none", label: "No restrictions" },
];
export const DIETARY_VALUES = new Set(DIETARY.map((d) => d.value));

/** Kept from the original onboarding: foods the planner should avoid. */
export const SKIP_OPTIONS = ["seafood", "shellfish", "pork", "beef", "spicy", "sushi"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }));

export function toggle(set: ReadonlySet<string>, v: string): Set<string> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

/** Toggle with one exclusive option (e.g. "No restrictions"): picking it clears the rest and vice versa. */
export function toggleExclusive(set: ReadonlySet<string>, v: string, exclusive: string): Set<string> {
  if (v === exclusive) return set.has(v) ? new Set() : new Set([v]);
  const next = toggle(set, v);
  next.delete(exclusive);
  return next;
}
