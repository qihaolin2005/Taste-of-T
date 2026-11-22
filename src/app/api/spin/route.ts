// Owner: P1 - Planner & Quests (see TEAM.md)
//   POST /api/spin { origin?, radiusMiles, budget?, craving?, exclude? } -> 201 SpinResult
// Spin the T: the ML recommender's picks within `radiusMiles` of `origin` (your phone's GPS,
// not stored; else your saved location), filtered by budget (price level 1-4) and craving,
// then a weighted-random pick from the top few. Creates a quest; start a trip with
// { placeId, questId } (POST /api/trips) and arriving completes it.
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { googlePlacesEnabled, listRestaurants, searchTextNear } from "@/lib/places";
import { rateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { SpinError, spinRequestSchema, spinTheT } from "@/features/spin";
import { findPlace } from "@/features/trips/http";
import { warmGallery } from "@/lib/places/photos";

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!rateLimit(`spin:${auth.userId}`, 20, 60_000)) return apiError("too_many_requests", "Spinning too fast. Give it a second.");
  const body = await parseBody(req, spinRequestSchema);
  if ("response" in body) return body.response;
  try {
    const google = googlePlacesEnabled();
    const result = await spinTheT(db, auth.userId, body.data, {
      source: google ? listRestaurants : null,
      searchCraving: google ? searchTextNear : undefined,
      findPlace,
    });
    // Start loading the place's photos now: they're usually ready by the time the card shows.
    warmGallery(result.place.placeId);
    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof SpinError) return apiError("not_found", err.message);
    throw err;
  }
}
