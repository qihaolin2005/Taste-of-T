// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// RestaurantCandidate: the existing CandidatePlace (model.ts) plus the fields the
// recommenders need. Every new field is optional so a plain CandidatePlace still fits;
// recommenders treat a missing field as "unknown" (see each module for what that means).
// The DB / seed data doesn't have these fields yet: see docs/ml-schema-proposal.md.
import { z } from "zod";
import { candidateSchema, type CandidatePlace } from "../model";

/**
 * How a place relates to meat, separate from the list of needs it can serve.
 *  - "veg-only":     fully vegetarian menu
 *  - "vegan-only":   fully vegan menu
 *  - "non-veg-only": no vegetarian options at all
 *  - "mixed":        regular menu; check `dietary` for what it can serve
 */
export const DIET_STYLES = ["veg-only", "vegan-only", "non-veg-only", "mixed"] as const;
export type DietStyle = (typeof DIET_STYLES)[number];

export type RestaurantCandidate = CandidatePlace & {
  name?: string;
  lat?: number;
  lng?: number;
  city?: string;
  neighborhood?: string;
  /** Cuisine tags. Falls back to `tags` when absent. Should match TASTE_VOCAB. */
  cuisines?: string[];
  /** 1-4 ($ to $$$$). Falls back to pricePerPerson when absent. */
  priceLevel?: number;
  /** Average star rating, 0-5. */
  rating?: number;
  reviewCount?: number;
  dietStyle?: DietStyle;
};

export const restaurantSchema = candidateSchema.extend({
  name: z.string().max(120).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  city: z.string().max(60).optional(),
  neighborhood: z.string().max(60).optional(),
  cuisines: z.array(z.string().max(40)).max(20).optional(),
  priceLevel: z.number().int().min(1).max(4).optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).optional(),
  dietStyle: z.enum(DIET_STYLES).optional(),
});

/** Lowercased cuisine tags for a place (cuisines, else tags). */
export function cuisinesOf(r: RestaurantCandidate): string[] {
  return [...new Set((r.cuisines ?? r.tags).map((t) => t.trim().toLowerCase()))];
}

/** Price level 1-4, estimated from pricePerPerson when priceLevel is missing. */
export function priceLevelOf(r: RestaurantCandidate): number {
  if (r.priceLevel != null) return r.priceLevel;
  const p = r.pricePerPerson;
  return p < 15 ? 1 : p < 30 ? 2 : p < 60 ? 3 : 4;
}

export const hasCoords = (r: RestaurantCandidate): r is RestaurantCandidate & { lat: number; lng: number } =>
  typeof r.lat === "number" && typeof r.lng === "number";
