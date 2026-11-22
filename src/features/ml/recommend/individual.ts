// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Recommender 1: one person.
//
//   candidates (nearby radius, or a destination neighborhood)
//     -> strict dietary filter (dietary.ts) -> "avoid" tags -> places they disliked
//     -> score = blend(similarity, quality, distance)   [weights: config.ts]
//     -> MMR re-rank for cuisine variety -> reasons
//
// Pure and synchronous: callers pass the UserContext and the places. Uses the existing
// UserContext from context.ts; swipes are optional and plug in when they exist.
import type { LatLng } from "@/lib/geo";
import { distanceMeters } from "@/lib/geo";
import { getStation } from "@/lib/mbta/stations";
import type { UserContext } from "../context";
import { RECOMMENDER_CONFIG, type RecommenderConfig } from "./config";
import { dietaryHighlights, fitWeight, normalizeDietary, selectByDietary } from "./dietary";
import { deriveInteractions, type Interaction, type Swipe } from "./interactions";
import { cuisinesOf, hasCoords, type RestaurantCandidate } from "./restaurant";
import { bayesianRating, buildUserProfile, cosine, cuisinePart, restaurantVector, tasteTagsOf, type UserProfile } from "./vectors";

const METERS_PER_MILE = 1609.344;

export type RecommendMode =
  | { kind: "nearby"; radiusMiles?: number }
  | {
      kind: "destination";
      neighborhood: string;
      /** Center of the destination. Defaults to the centroid of places tagged with the neighborhood. */
      center?: LatLng;
      radiusMiles?: number;
    };

export type ScoreComponents = {
  /** 0-1, (cosine + 1) / 2 between user and restaurant vectors. 0.5 when there's no profile. */
  similarity: number;
  /** 0-1, Bayesian rating mapped from [rating.floor, rating.max]. */
  quality: number;
  /** 0-1, 1 at the origin, 0 at the radius. 0.5 when unknown or not used. */
  distance: number;
  /** 0-1, how much of the similarity weight is switched on (cold start -> 0). */
  confidence: number;
};

export type ScoredPlace = {
  place: RestaurantCandidate;
  score: number;
  components: ScoreComponents;
  distanceMiles: number | null;
  reasons: string[];
  /** reasons joined, e.g. "you liked other thai places, 0.4 mi away, has vegan options" */
  reason: string;
};

export type IndividualOptions = {
  mode?: RecommendMode;
  /** Solo or group swipes, when they exist. Ratings/wishlist/check-ins come from the context. */
  swipes?: readonly Swipe[];
  /** Every place we know about, so history outside the search area still teaches the profile. Defaults to `places`. */
  catalog?: readonly RestaurantCandidate[];
  limit?: number;
  /** Override where "nearby" is measured from. Defaults to context location, then start, then home station. */
  origin?: LatLng;
  /** Only these kinds of place ("dinner", "dessert", "activity"). Default: all of them. */
  categories?: readonly string[];
  config?: RecommenderConfig;
};

export type IndividualResult = {
  results: ScoredPlace[];
  origin: { point: LatLng; source: "override" | "location" | "start-station" | "home-station" | "destination" } | null;
  /** How many places each step removed, for debugging and UI copy. */
  counts: { input: number; otherCategory: number; outOfArea: number; dietary: number; avoided: number; disliked: number; scored: number };
  confidence: number;
  warnings: string[];
};

// ------------------------------------------------------------- helpers

/** A place's coordinates, falling back to its station's. */
export function placePoint(p: RestaurantCandidate): LatLng | null {
  if (hasCoords(p)) return { lat: p.lat, lng: p.lng };
  const st = getStation(p.stationId);
  return st ? { lat: st.lat, lng: st.lng } : null;
}

const miles = (a: LatLng, b: LatLng) => distanceMeters(a, b) / METERS_PER_MILE;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

function resolveOrigin(ctx: UserContext, override?: LatLng): IndividualResult["origin"] {
  if (override) return { point: override, source: "override" };
  if (ctx.location) return { point: { lat: ctx.location.lat, lng: ctx.location.lng }, source: "location" };
  for (const [id, source] of [[ctx.stations.start, "start-station"], [ctx.stations.home, "home-station"]] as const) {
    const st = id ? getStation(id) : undefined;
    if (st) return { point: { lat: st.lat, lng: st.lng }, source };
  }
  return null;
}

const sameText = (a: string | undefined, b: string) => a != null && a.trim().toLowerCase() === b.trim().toLowerCase();

function centroid(points: LatLng[]): LatLng | null {
  if (!points.length) return null;
  return { lat: points.reduce((s, p) => s + p.lat, 0) / points.length, lng: points.reduce((s, p) => s + p.lng, 0) / points.length };
}

export function qualityScore(p: RestaurantCandidate, cfg: RecommenderConfig = RECOMMENDER_CONFIG): number {
  const { floor, max } = cfg.rating;
  return clamp01((bayesianRating(p, cfg) - floor) / (max - floor));
}

/** Blend weights after cold-start shifting. Returned weights sum to 1. */
export function blendWeights(confidence: number, useDistance: boolean, cfg: RecommenderConfig = RECOMMENDER_CONFIG) {
  const b = cfg.blend;
  const wq0 = b.quality;
  const wd0 = useDistance ? b.distance : 0;
  const total = b.similarity + wq0 + wd0;
  const ws = b.similarity * confidence;
  const freed = b.similarity - ws;
  const rest = wq0 + wd0;
  const wq = rest > 0 ? wq0 + (freed * wq0) / rest : 0;
  const wd = rest > 0 ? wd0 + (freed * wd0) / rest : 0;
  return { similarity: ws / total, quality: wq / total, distance: wd / total };
}

export function confidenceFrom(evidence: number, cfg: RecommenderConfig = RECOMMENDER_CONFIG): number {
  return evidence / (evidence + cfg.coldStartK);
}

// ------------------------------------------------------------- scoring (shared with group)

export type ProfiledUser = { ctx: UserContext; interactions: Interaction[]; profile: UserProfile; confidence: number };

export function profileUser(
  ctx: UserContext,
  catalog: readonly RestaurantCandidate[],
  swipes: readonly Swipe[] = [],
  cfg: RecommenderConfig = RECOMMENDER_CONFIG,
): ProfiledUser {
  const interactions = deriveInteractions(ctx, swipes, cfg);
  const profile = buildUserProfile(interactions, new Map(catalog.map((p) => [p.id, p])), cfg, ctx.preferences.tastes);
  return { ctx, interactions, profile, confidence: confidenceFrom(profile.evidence, cfg) };
}

/**
 * Score one place for one person. `distance01` is 0-1 (1 = right here) or null to leave
 * distance out of the blend entirely (group mode has no radius).
 */
export function scorePlace(user: ProfiledUser, place: RestaurantCandidate, distance01: number | null, cfg: RecommenderConfig = RECOMMENDER_CONFIG): { score: number; components: ScoreComponents } {
  const hasProfile = user.profile.evidence > 0;
  const sim = hasProfile ? (cosine(user.profile.vector, restaurantVector(place, cfg)) + 1) / 2 : 0.5;
  const quality = qualityScore(place, cfg);
  const w = blendWeights(user.confidence, distance01 != null, cfg);
  const distance = distance01 ?? 0.5;
  const score = w.similarity * sim + w.quality * quality + w.distance * distance;
  return { score: round(score), components: { similarity: round(sim), quality: round(quality), distance: round(distance), confidence: round(user.confidence) } };
}

// ------------------------------------------------------------- MMR

/** Maximal marginal relevance over cuisine vectors: trades a bit of score for variety. */
export function mmrRerank<T extends { score: number; place: RestaurantCandidate }>(items: readonly T[], limit: number, lambda: number, cfg: RecommenderConfig = RECOMMENDER_CONFIG): T[] {
  const pool = [...items].sort((a, b) => b.score - a.score);
  const vecs = new Map(pool.map((it) => [it, cuisinePart(restaurantVector(it.place, cfg))]));
  const picked: T[] = [];
  while (picked.length < limit && pool.length) {
    let bestIdx = 0;
    let best = -Infinity;
    pool.forEach((it, i) => {
      const maxSim = picked.length ? Math.max(...picked.map((p) => cosine(vecs.get(it)!, vecs.get(p)!))) : 0;
      const mmr = lambda * it.score - (1 - lambda) * maxSim;
      if (mmr > best + 1e-12) {
        best = mmr;
        bestIdx = i;
      }
    });
    picked.push(pool.splice(bestIdx, 1)[0]);
  }
  return picked;
}

// ------------------------------------------------------------- reasons

function fmtMiles(mi: number): string {
  return mi < 0.1 ? "under 0.1 mi" : `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

export function buildReasons(
  user: ProfiledUser,
  sp: { place: RestaurantCandidate; components: ScoreComponents; distanceMiles: number | null },
  catalogById: ReadonlyMap<string, RestaurantCandidate>,
  where: { kind: "nearby" } | { kind: "destination"; neighborhood: string } | { kind: "none" },
  cfg: RecommenderConfig = RECOMMENDER_CONFIG,
): string[] {
  const r: string[] = [];
  const { place, components: c } = sp;
  const h = user.ctx.history;

  const rated = h.ratings.find((x) => x.placeId === place.id);
  if (rated && rated.score >= 7) r.push(`you rated it ${rated.score}/10`);
  else if (h.wishlistPlaceIds.includes(place.id)) r.push("on your wishlist");
  else if (h.checkInPlaceIds.includes(place.id)) r.push("you've been here");

  const mine = new Set(tasteTagsOf(place, cfg));
  const shared = new Map<string, number>();
  if (c.confidence > 0 && c.similarity >= 0.5 + cfg.reasons.minSimilarity / 2) {
    for (const id of user.profile.liked.keys()) {
      if (id === place.id) continue;
      const lp = catalogById.get(id);
      if (!lp) continue;
      for (const cu of tasteTagsOf(lp, cfg)) if (mine.has(cu)) shared.set(cu, (shared.get(cu) ?? 0) + 1);
    }
  }
  const top = [...shared.entries()].sort((a, b) => b[1] - a[1])[0];
  const statedMatch = user.profile.statedTastes.find((t) => mine.has(t));
  if (top) r.push(`you liked other ${top[0]} places`);
  else if (statedMatch) r.push(`you said you like ${statedMatch}`);
  else if (user.profile.liked.size > 0 && c.confidence > 0 && c.similarity >= 0.5 + cfg.reasons.minSimilarity / 2) r.push("similar to places you liked");

  if (sp.distanceMiles != null) {
    if (where.kind === "destination") r.push(sameText(place.neighborhood, where.neighborhood) ? `in ${place.neighborhood}` : `${fmtMiles(sp.distanceMiles)} from ${where.neighborhood}`);
    else if (where.kind === "nearby") r.push(`${fmtMiles(sp.distanceMiles)} away`);
  }

  if (place.rating != null && place.rating >= cfg.reasons.goodRating && (place.reviewCount ?? 0) >= cfg.reasons.minReviewsForRating)
    r.push(`${place.rating.toFixed(1)}★ from ${fmtCount(place.reviewCount!)} reviews`);

  r.push(...dietaryHighlights(place, user.ctx.preferences.dietary, cfg));
  return r;
}

// ------------------------------------------------------------- main

export function recommendForUser(ctx: UserContext, allPlaces: readonly RestaurantCandidate[], opts: IndividualOptions = {}): IndividualResult {
  const cfg = opts.config ?? RECOMMENDER_CONFIG;
  const mode: RecommendMode = opts.mode ?? { kind: "nearby" };
  const limit = opts.limit ?? cfg.defaultLimit;
  const catalog = opts.catalog ?? allPlaces;
  const wanted = opts.categories ? new Set(opts.categories) : null;
  const places = wanted ? allPlaces.filter((p) => wanted.has(p.category)) : allPlaces;
  const catalogById = new Map(catalog.map((p) => [p.id, p]));
  const warnings: string[] = [];
  const counts: IndividualResult["counts"] = { input: allPlaces.length, otherCategory: allPlaces.length - places.length, outOfArea: 0, dietary: 0, avoided: 0, disliked: 0, scored: 0 };

  // 1. Candidate generation
  let origin: IndividualResult["origin"];
  let radius: number;
  let inArea: { place: RestaurantCandidate; mi: number | null }[];
  if (mode.kind === "nearby") {
    origin = resolveOrigin(ctx, opts.origin);
    radius = mode.radiusMiles ?? cfg.candidates.nearbyRadiusMiles;
    if (!origin) {
      warnings.push("No location, start station, or home station: can't search nearby.");
      inArea = [];
    } else {
      const o = origin.point;
      inArea = places.flatMap((p) => {
        const pt = placePoint(p);
        const mi = pt ? miles(o, pt) : Infinity;
        return mi <= radius ? [{ place: p, mi }] : [];
      });
    }
  } else {
    radius = mode.radiusMiles ?? cfg.candidates.destinationRadiusMiles;
    const tagged = places.filter((p) => sameText(p.neighborhood, mode.neighborhood));
    const center = mode.center ?? centroid(tagged.map(placePoint).filter((x): x is LatLng => x !== null));
    origin = center ? { point: center, source: "destination" } : null;
    if (!center && !tagged.length) warnings.push(`No places found in or near "${mode.neighborhood}".`);
    inArea = places.flatMap((p) => {
      const pt = placePoint(p);
      const mi = center && pt ? miles(center, pt) : null;
      return sameText(p.neighborhood, mode.neighborhood) || (mi != null && mi <= radius) ? [{ place: p, mi }] : [];
    });
    // Neighborhoods aren't circles: scale distance by the farthest candidate, at least the radius.
    radius = Math.max(radius, ...inArea.map((x) => x.mi ?? 0));
  }
  counts.outOfArea = places.length - inArea.length;

  // 2. Hard filters: dietary (see dietary.ts: strict for allergies/religion, softer for veg/vegan),
  //    avoid tags, then places they clearly disliked
  const needs = normalizeDietary(ctx.preferences.dietary);
  const diet = selectByDietary(inArea.map((x) => x.place), needs, cfg);
  counts.dietary = inArea.length - diet.kept.length;
  let pool = inArea.filter((x) => diet.fit.has(x.place.id));

  const avoid = new Set(ctx.preferences.avoid.map((t) => t.toLowerCase()));
  const beforeAvoid = pool.length;
  pool = pool.filter((x) => ![...cuisinesOf(x.place), ...x.place.tags.map((t) => t.toLowerCase())].some((t) => avoid.has(t)));
  counts.avoided = beforeAvoid - pool.length;

  const user = profileUser(ctx, catalog, opts.swipes, cfg);
  const beforeDislike = pool.length;
  pool = pool.filter((x) => (user.profile.disliked.get(x.place.id) ?? 0) > cfg.excludeDislikedAt);
  counts.disliked = beforeDislike - pool.length;

  // 3. Score
  const scored = pool.map(({ place, mi }) => {
    const d01 = mi == null ? null : clamp01(1 - mi / Math.max(radius, 1e-9));
    const { score, components } = scorePlace(user, place, d01, cfg);
    // A place that only probably has options for their diet ranks a little lower.
    return { place, score: round(score * fitWeight(diet.fit.get(place.id), cfg)), components, distanceMiles: mi == null ? null : round(mi, 2) };
  });
  counts.scored = scored.length;

  // 4. Diversity + reasons
  const where = mode.kind === "destination" ? { kind: "destination" as const, neighborhood: mode.neighborhood } : { kind: "nearby" as const };
  const results: ScoredPlace[] = mmrRerank(scored, limit, cfg.mmr.lambda, cfg).map((sp) => {
    const reasons = buildReasons(user, sp, catalogById, where, cfg);
    return { ...sp, reasons, reason: reasons.join(", ") };
  });

  return { results, origin, counts, confidence: round(user.confidence), warnings };
}
