// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
//   POST /api/rewards/visits  { placeId, receipt: { total, date, merchantName?, diners?, receiptNumber? }, travel? }
//     -> 201 ClaimResult { visitId, points, breakdown, groupMultiplier, groupSize, recommendedVia, xp }
// Claim points for eating at a recommended place. The receipt arrives already read (OCR happens
// before this); `travel` comes from trip detection. Rules: src/features/rewards/config.ts.
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { googlePlacesEnabled, listRestaurants } from "@/lib/places";
import { loadRestaurants } from "@/features/ml";
import { claimVisit, claimVisitSchema, RewardError } from "@/features/rewards";

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const parsed = claimVisitSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return apiError("bad_request", "Invalid request body", issues);
  }

  // The place's name, to check it against the receipt (skipped if the place can't be found).
  const { places } = await loadRestaurants(googlePlacesEnabled() ? listRestaurants : null);
  const placeName = places.find((p) => p.id === parsed.data.placeId)?.name ?? null;

  try {
    return Response.json(await claimVisit(db, auth.userId, parsed.data, { placeName }), { status: 201 });
  } catch (err) {
    if (err instanceof RewardError) return apiError(err.code, err.message);
    throw err;
  }
}
