// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET /api/places/autocomplete?q=davis sq&session=<uuid>
//     -> 200 { suggestions: [{ kind: "station", stationId, title, subtitle } | { kind: "place", placeId, title, subtitle }], google: boolean }
// "Search address or T station" (Adventure's "Going home to"). T stations always work (local
// data); Boston addresses and landmarks come from Google when PLACES_API_KEY is set. Signed-in
// users only, rate limited; the client debounces and sends one session token per search.
import { apiError } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { matchStations, suggestPlaces, type LocationSuggestion } from "@/lib/places/locationSearch";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const session = url.searchParams.get("session") ?? "";
  if (q.length < 2) return Response.json({ suggestions: [], google: false });
  if (!rateLimit(`place-search:${auth.userId}:${clientIp(req)}`, 120, 10 * 60_000)) return apiError("too_many_requests", "Too many searches. Try again in a bit.");

  const stations = matchStations(q);
  let places: LocationSuggestion[] = [];
  let google = false;
  if (/^[\w-]{8,64}$/.test(session)) {
    try {
      places = await suggestPlaces(q, session);
      google = true;
    } catch (err) {
      console.error("place autocomplete failed:", (err as Error).message); // stations still work
    }
  }
  return Response.json({ suggestions: [...stations, ...places].slice(0, 8), google }, { headers: { "cache-control": "no-store" } });
}
