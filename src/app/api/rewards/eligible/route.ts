// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
//   GET /api/rewards/eligible -> { places: [{ placeId, name, via: "squad" | "for-you", at }] }
// Places recommended to you in the last 48 h (squad top 5s first), i.e. what you can claim points for.
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { googlePlacesEnabled, listRestaurants } from "@/lib/places";
import { loadRestaurants } from "@/features/ml";
import { listClaimablePlaces } from "@/features/rewards";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const places = await listClaimablePlaces(db, auth.userId);
  if (places.some((p) => !p.name)) {
    const { places: known } = await loadRestaurants(googlePlacesEnabled() ? listRestaurants : null);
    const names = new Map(known.map((k) => [k.id, k.name ?? null]));
    for (const p of places) p.name ??= names.get(p.placeId) ?? null;
  }
  return Response.json({ places }, { headers: { "cache-control": "no-store" } });
}
