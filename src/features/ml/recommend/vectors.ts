// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Content-based representation. Restaurant -> fixed-length vector; user -> preference vector
// in the same space (weighted average of liked vectors minus disliked ones).
//
// Layout (blocks are scaled by RECOMMENDER_CONFIG.vectorBlocks before cosine):
//   cuisine:  one-hot over TASTE_VOCAB (food tags only matter; others just stay 0)
//   price:    one-hot over price level 1-4
//   quality:  one value, Bayesian rating / 5
//   dietary:  one flag per DIETARY_VOCAB entry (vegetarian/vegan also from dietStyle)
import { DIETARY_VOCAB, TASTE_VOCAB } from "../vocab";
import { RECOMMENDER_CONFIG, type RecommenderConfig } from "./config";
import { passesDietary } from "./dietary";
import type { Interaction } from "./interactions";
import { cuisinesOf, priceLevelOf, type RestaurantCandidate } from "./restaurant";

export const CUISINE_DIM = TASTE_VOCAB.length;
const PRICE_DIM = 4;
export const VECTOR_DIM = CUISINE_DIM + PRICE_DIM + 1 + DIETARY_VOCAB.length;
const cuisineIndex = new Map<string, number>(TASTE_VOCAB.map((t, i) => [t, i]));

/** Rating shrunk toward the prior by review count, in 0..max. Missing rating = the prior. */
export function bayesianRating(r: RestaurantCandidate, cfg: RecommenderConfig = RECOMMENDER_CONFIG): number {
  const { priorMean, priorCount } = cfg.rating;
  if (r.rating == null) return priorMean;
  const n = Math.max(0, r.reviewCount ?? 0);
  return (n * r.rating + priorCount * priorMean) / (n + priorCount);
}

export function restaurantVector(r: RestaurantCandidate, cfg: RecommenderConfig = RECOMMENDER_CONFIG): number[] {
  const b = cfg.vectorBlocks;
  const v = new Array<number>(VECTOR_DIM).fill(0);
  for (const c of cuisinesOf(r)) {
    const i = cuisineIndex.get(c);
    if (i != null) v[i] = b.cuisine;
  }
  v[CUISINE_DIM + priceLevelOf(r) - 1] = b.price;
  v[CUISINE_DIM + PRICE_DIM] = b.quality * (bayesianRating(r, cfg) / cfg.rating.max);
  DIETARY_VOCAB.forEach((d, i) => {
    if (passesDietary(r, [d])) v[CUISINE_DIM + PRICE_DIM + 1 + i] = b.dietary;
  });
  return v;
}

/** Just the cuisine block, for diversity (MMR) comparisons. */
export const cuisinePart = (v: readonly number[]) => v.slice(0, CUISINE_DIM);

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export type UserProfile = {
  /** Preference vector; all zeros when there's nothing to learn from. */
  vector: number[];
  /** Sum of |weight| over interactions that matched a known place. Drives cold-start blending. */
  evidence: number;
  /** Ids of places with net positive / negative weight (for reasons and exclusion). */
  liked: Map<string, number>;
  disliked: Map<string, number>;
};

/**
 * Weighted average: sum(w_i * v_i) / sum(|w_i|). Likes pull toward a place's features,
 * dislikes push away. Interactions with places we have no data for are skipped.
 */
export function buildUserProfile(
  interactions: readonly Interaction[],
  placesById: ReadonlyMap<string, RestaurantCandidate>,
  cfg: RecommenderConfig = RECOMMENDER_CONFIG,
): UserProfile {
  const vector = new Array<number>(VECTOR_DIM).fill(0);
  const liked = new Map<string, number>();
  const disliked = new Map<string, number>();
  let evidence = 0;
  for (const it of interactions) {
    if (it.weight > 0) liked.set(it.placeId, it.weight);
    else if (it.weight < 0) disliked.set(it.placeId, it.weight);
    const place = placesById.get(it.placeId);
    if (!place || it.weight === 0) continue;
    const pv = restaurantVector(place, cfg);
    for (let i = 0; i < VECTOR_DIM; i++) vector[i] += it.weight * pv[i];
    evidence += Math.abs(it.weight);
  }
  if (evidence > 0) for (let i = 0; i < VECTOR_DIM; i++) vector[i] /= evidence;
  return { vector, evidence, liked, disliked };
}
