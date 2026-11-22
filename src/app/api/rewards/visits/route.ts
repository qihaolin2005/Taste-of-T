// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
//   POST /api/rewards/visits  { placeId, location: { lat, lng, accuracyM? }, receiptToken?, receipt?, diners?, travel?: { rideId } }
//     -> 201 ClaimResult { visitId, points, breakdown, groupMultiplier, groupSize, recommendedVia, xp, travelNote?, checkInDistanceM }
// Claim points for eating at a recommended place, while you're there:
//   - `location` must be at the restaurant (GPS check-in)
//   - `receiptToken` comes from scanning the receipt (POST /api/rewards/receipt); a typed
//     `receipt` is only accepted when scanning isn't configured (no GEMINI_API_KEY)
//   - `travel.rideId` is a ride verified against live MBTA data (POST /api/rides/ping)
// Proof: src/features/rewards/proof.ts. Rules: src/features/rewards/config.ts.
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { sessionSecret } from "@/lib/sessionToken";
import { googlePlacesEnabled, listRestaurants } from "@/lib/places";
import { loadRestaurants } from "@/features/ml";
import { claimRequestSchema, claimVisit, resolveClaim, RewardError } from "@/features/rewards";
import { receiptScanEnabled } from "@/features/rewards/receiptOcr";

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const parsed = claimRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return apiError("bad_request", "Invalid request body", issues);
  }

  // The place's name, to check it against the receipt.
  const { places } = await loadRestaurants(googlePlacesEnabled() ? listRestaurants : null);
  const place = places.find((p) => p.id === parsed.data.placeId);
  const placeName = place?.name ?? null;
  // Where the place is: you must be there to claim, and a ride must have ended near it.
  const placeCoords = place && typeof place.lat === "number" && typeof place.lng === "number" ? { lat: place.lat, lng: place.lng } : null;

  try {
    const { input, checkInDistanceM } = resolveClaim(auth.userId, parsed.data, { placeCoords, secret: sessionSecret(), requireReceiptScan: receiptScanEnabled() });
    const result = await claimVisit(db, auth.userId, input, { placeName, placeCoords });
    return Response.json({ ...result, checkInDistanceM }, { status: 201 });
  } catch (err) {
    if (err instanceof RewardError) return apiError(err.code, err.message);
    throw err;
  }
}
