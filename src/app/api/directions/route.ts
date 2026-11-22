// Owner: P4 - Game Layer & Map (see TEAM.md)
//   GET /api/directions?from=lat,lng&to=lat,lng&name=Place
//     -> 200 { plan: TripPlan | null }   (null: no T within walking distance; use Google Maps)
// How to get from `from` (your phone's position) to a place by T and bus. Google transit when
// configured, else the offline subway planner. See src/features/directions.
import { apiError } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { distanceMeters } from "@/lib/geo";
import { parseLatLng, planTrip } from "@/features/directions";

/** Greater Boston, generously. Outside this the T can't help and we don't call Google. */
const BOSTON = { lat: 42.36, lng: -71.06 };
const MAX_FROM_BOSTON_M = 60_000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = parseLatLng(url.searchParams.get("from"));
  const to = parseLatLng(url.searchParams.get("to"));
  if (!from || !to) return apiError("bad_request", "Send from=lat,lng and to=lat,lng");
  if (distanceMeters(from, BOSTON) > MAX_FROM_BOSTON_M || distanceMeters(to, BOSTON) > MAX_FROM_BOSTON_M) {
    return Response.json({ plan: null }, { headers: { "cache-control": "no-store" } });
  }
  // Google directions are a paid call: plenty for real use, not for a loop.
  if (!rateLimit(`directions:${clientIp(req)}`, 30, 10 * 60_000)) return apiError("too_many_requests", "Too many route requests. Try again in a few minutes.");
  const name = url.searchParams.get("name")?.slice(0, 120) || undefined;
  const plan = await planTrip(from, { ...to, name });
  return Response.json({ plan }, { headers: { "cache-control": "no-store" } });
}
