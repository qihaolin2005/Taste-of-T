// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET /api/places/resolve?placeId=ChIJ...&session=<uuid>
//     -> 200 { home: { stationId, stationName, label, walkMinutes } }   (nearest T station)
//     -> 404 if the place isn't within walking distance of the T
// Ends an autocomplete session (same token) so Google bills the search once. Nothing is stored.
import { apiError } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { HOME_MAX_METERS, resolveHome } from "@/lib/places/locationSearch";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const placeId = url.searchParams.get("placeId") ?? "";
  const session = url.searchParams.get("session") ?? "";
  if (!/^[\w-]{10,300}$/.test(placeId) || !/^[\w-]{8,64}$/.test(session)) return apiError("bad_request", "Pick a place from the list.");
  if (!rateLimit(`place-resolve:${auth.userId}:${clientIp(req)}`, 30, 10 * 60_000)) return apiError("too_many_requests", "Too many lookups. Try again in a bit.");
  try {
    const home = await resolveHome(placeId, session);
    if (!home) return apiError("not_found", `That's more than ${HOME_MAX_METERS / 1000} km from any T station. Pick the station you'd ride home to instead.`);
    return Response.json({ home }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("place resolve failed:", (err as Error).message);
    return apiError("unavailable", "Couldn't look that place up. Try a T station instead.");
  }
}
