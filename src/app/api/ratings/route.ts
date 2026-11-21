// Owner: P4 - Game Layer & Map (see TEAM.md)
//   GET  /api/ratings -> { ratings: [{ placeId, score, note, updatedAt }] }
//   POST /api/ratings { placeId, score: 0-10, note? } -> { rating }   (rate or re-rate)
// Ratings teach the recommender: 8-10 is a like, 0-3 a dislike.
import { parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { listRatings, ratePlace, rateSchema } from "@/features/ratings";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return Response.json({ ratings: await listRatings(db, auth.userId) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await parseBody(req, rateSchema);
  if ("response" in body) return body.response;
  return Response.json({ rating: await ratePlace(db, auth.userId, body.data) });
}
