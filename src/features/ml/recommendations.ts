// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// "For you" recommendations for one user: the individual content-based recommender, fed with
// everything we know about them (preferences, dietary needs, ratings, wishlist, check-ins,
// solo + squad swipes). This is what POST /api/me/recommendations returns.
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { buildUserContext } from "./context";
import { loadUserSwipes } from "./history";
import { RECOMMENDER_CONFIG } from "./recommend/config";
import { recommendForUser, type IndividualResult, type RecommendMode } from "./recommend/individual";
import { restaurantSchema, type RestaurantCandidate } from "./recommend/restaurant";
import { loadRestaurants, type RestaurantSource } from "./recommend/source";

export const RECOMMENDER_MODEL_NAME = "content-v1";

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict();

export const recommendationsRequestSchema = z
  .object({
    /** Where to look. Default: nearby (5 mi) from the user's location, start station, or home station. */
    mode: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("nearby"), radiusMiles: z.number().positive().max(50).optional() }).strict(),
        z
          .object({ kind: z.literal("destination"), neighborhood: z.string().trim().min(1).max(60), center: latLng.optional(), radiusMiles: z.number().positive().max(20).optional() })
          .strict(),
      ])
      .optional(),
    limit: z.number().int().min(1).max(50).optional(),
    /** Kinds of place to recommend. Default: food (dinner + dessert). */
    categories: z.array(z.enum(["dinner", "dessert", "activity"])).min(1).max(3).optional(),
    /** Use this point for "nearby" instead of the stored location (e.g. the phone's current GPS; not saved). */
    origin: latLng.optional(),
    /** Restaurants to choose from. Default: the seed list (data/seed-restaurants.json). */
    candidates: z.array(restaurantSchema).max(500).optional(),
  })
  .strict();
export type RecommendationsRequest = z.infer<typeof recommendationsRequestSchema>;

export type RecommendationItem = {
  placeId: string;
  name: string | null;
  category: RestaurantCandidate["category"];
  score: number;
  /** e.g. "you liked other thai places, 0.4 mi away, has vegan options" */
  reason: string;
  reasons: string[];
  distanceMiles: number | null;
  cuisines: string[];
  rating: number | null;
  priceLevel: number | null;
  neighborhood: string | null;
  components: IndividualResult["results"][number]["components"];
};

export type RecommendationsResponse = {
  model: string;
  results: RecommendationItem[];
  /** 0 = no history yet (cold start: rating + distance only); approaches 1 as history grows. */
  confidence: number;
  origin: IndividualResult["origin"];
  counts: IndividualResult["counts"];
  /** How many swipes fed the profile (ratings/wishlist/check-ins come from the user's context). */
  swipesUsed: number;
  /** Where the restaurants came from: the request body, the live source, or the offline seed list. */
  restaurantsFrom: "candidates" | "source" | "seed";
  warnings: string[];
};

/** Returns null if the user doesn't exist. */
export async function getRecommendations(
  db: PrismaClient,
  userId: string,
  req: RecommendationsRequest = {},
  opts: {
    now?: Date;
    /** Live restaurant source (the places client). Without it, or if it fails, the seed list is used. */
    source?: RestaurantSource | null;
    /** Override the offline list (tests). */
    seed?: () => { places: RestaurantCandidate[]; skipped: number };
  } = {},
): Promise<RecommendationsResponse | null> {
  const ctx = await buildUserContext(db, userId, opts.now);
  if (!ctx) return null;
  const swipes = await loadUserSwipes(db, userId, RECOMMENDER_CONFIG.session.historySwipes);

  const warnings: string[] = [];
  let places = req.candidates;
  let restaurantsFrom: RecommendationsResponse["restaurantsFrom"] = "candidates";
  if (!places) {
    const loaded = await loadRestaurants(opts.source, { seed: opts.seed });
    places = loaded.places;
    restaurantsFrom = loaded.from;
    warnings.push(...loaded.warnings);
  }

  const r = recommendForUser(ctx, places, {
    mode: req.mode as RecommendMode | undefined,
    limit: req.limit,
    origin: req.origin,
    swipes,
    categories: req.categories ?? RECOMMENDER_CONFIG.categories.soloDefault,
  });

  // Remember what we showed, so the rewards system can check a visit was to a recommended place.
  const shownAt = opts.now ?? new Date();
  if (r.results.length) {
    await db.$transaction(
      r.results.map((x) =>
        db.recommendationShown.upsert({
          where: { userId_placeId: { userId, placeId: x.place.id } },
          create: { userId, placeId: x.place.id, shownAt },
          update: { shownAt },
        }),
      ),
    );
  }

  return {
    model: RECOMMENDER_MODEL_NAME,
    results: r.results.map((x) => ({
      placeId: x.place.id,
      name: x.place.name ?? null,
      score: x.score,
      reason: x.reason,
      reasons: x.reasons,
      distanceMiles: x.distanceMiles,
      category: x.place.category,
      cuisines: x.place.cuisines ?? x.place.tags,
      rating: x.place.rating ?? null,
      priceLevel: x.place.priceLevel ?? null,
      neighborhood: x.place.neighborhood ?? null,
      components: x.components,
    })),
    confidence: r.confidence,
    origin: r.origin,
    counts: r.counts,
    swipesUsed: swipes.length,
    restaurantsFrom,
    warnings: [...warnings, ...r.warnings],
  };
}
