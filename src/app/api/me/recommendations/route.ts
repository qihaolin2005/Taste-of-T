// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
//   POST /api/me/recommendations  { mode?, limit?, origin?, candidates? }   (empty body is fine)
//     -> RecommendationsResponse: ranked results with a reason each, confidence, warnings
// "For you" list from the content-based recommender, using the user's preferences, dietary
// needs (hard filter), ratings, wishlist, check-ins, and solo + squad swipes.
//   mode: { kind: "nearby", radiusMiles? } (default) | { kind: "destination", neighborhood, center?, radiusMiles? }
//   origin: { lat, lng } to search near the phone's current position without storing it
//   candidates: restaurants to rank; defaults to RESTAURANT_SOURCE below, else data/seed-restaurants.json
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { getRecommendations, recommendationsRequestSchema, type RestaurantSource } from "@/features/ml";

// TODO(P2): when the places client lands, set this to its list function, e.g.
//   import { listRestaurants } from "@/lib/places";
//   const RESTAURANT_SOURCE: RestaurantSource | null = listRestaurants;
// Contract: docs/restaurant-source.md. If it fails or times out, the seed list is used.
const RESTAURANT_SOURCE: RestaurantSource | null = null;

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let raw: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      return apiError("bad_request", "Body must be valid JSON");
    }
  }
  const parsed = recommendationsRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return apiError("bad_request", "Invalid request body", issues);
  }

  const result = await getRecommendations(db, auth.userId, parsed.data, { source: RESTAURANT_SOURCE });
  if (!result) return apiError("not_found", "User not found");
  return Response.json(result);
}
