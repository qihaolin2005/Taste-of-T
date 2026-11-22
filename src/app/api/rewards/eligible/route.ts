// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
//   GET /api/rewards/eligible[?placeId=] -> { places: [{ placeId, name, via: "squad" | "for-you", at }], visitsLeftToday, receiptScan }
// Places recommended to you in the last 48 h (squad top 5s first) that you haven't already
// claimed today, i.e. what you can claim points for, plus how many claims you have left today.
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { googlePlacesEnabled, listRestaurants } from "@/lib/places";
import { loadRestaurants } from "@/features/ml";
import { listClaimablePlaces, visitsLeftToday } from "@/features/rewards";
import { receiptScanEnabled } from "@/features/rewards/receiptOcr";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  // ?placeId=: the place the claim screen was opened for (e.g. right after a Spin trip)
  const include = new URL(req.url).searchParams.get("placeId")?.slice(0, 300) || null;
  const places = await listClaimablePlaces(db, auth.userId, { include });
  if (places.some((p) => !p.name)) {
    const { places: known } = await loadRestaurants(googlePlacesEnabled() ? listRestaurants : null);
    const names = new Map(known.map((k) => [k.id, k.name ?? null]));
    for (const p of places) p.name ??= names.get(p.placeId) ?? null;
  }
  return Response.json({ places, visitsLeftToday: await visitsLeftToday(db, auth.userId), receiptScan: receiptScanEnabled() }, { headers: { "cache-control": "no-store" } });
}
