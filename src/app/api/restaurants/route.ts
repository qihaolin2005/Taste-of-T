// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET /api/restaurants?station=place-chncl&category=dinner&q=dumplings&radius=800&limit=20
//     -> { places, from: "google" | "seed", warning? }
// Places near a T station, from Google Places (if PLACES_API_KEY is set) or the demo seed list.
// Signed-in only and rate limited per user, because every Google call costs money.
import { z } from "zod";
import { apiError } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { isKnownStation } from "@/lib/mbta/stations";
import { searchPlaces } from "@/lib/places";

const querySchema = z.object({
  station: z.string().min(1).max(64).refine(isKnownStation, "Unknown station id"),
  category: z.enum(["dinner", "dessert", "activity"]).optional(),
  q: z.string().trim().min(1).max(80).optional(),
  radius: z.coerce.number().int().min(100).max(3000).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!rateLimit(`places:${auth.userId}`, 60, 60 * 60_000)) return apiError("too_many_requests", "Too many searches. Try again in a bit.");

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return apiError("bad_request", "Invalid query", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const { station, category, q, radius, limit } = parsed.data;
  const result = await searchPlaces({ stationId: station, category, text: q, radiusM: radius, limit });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
