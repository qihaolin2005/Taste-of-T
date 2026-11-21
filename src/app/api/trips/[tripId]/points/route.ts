// Owner: P2 - Data & Integrations (see TEAM.md)
//   POST /api/trips/:id/points { points: [{ lat, lng, t, accuracyM? }] } -> TripView
// `t` is the fix time in epoch ms (GeolocationPosition.timestamp). Send in batches (~every 15 s).
// Bad fixes (inaccurate, jitter, impossible jumps) are dropped. Reaching the destination
// finishes the trip (status "finished", arrived true).
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { addPoints } from "@/features/trips";
import { tripErrorResponse } from "@/features/trips/http";

const pointsSchema = z
  .object({
    points: z
      .array(
        z
          .object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
            t: z.number().int().positive(),
            accuracyM: z.number().min(0).max(100_000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export async function POST(req: Request, ctx: RouteContext<"/api/trips/[tripId]/points">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!rateLimit(`trip-points:${auth.userId}`, 20, 60_000)) return apiError("too_many_requests", "Sending points too often. Every 15 seconds is enough.");
  const body = await parseBody(req, pointsSchema);
  if ("response" in body) return body.response;
  const { tripId } = await ctx.params;
  try {
    return Response.json(await addPoints(db, auth.userId, tripId, body.data.points));
  } catch (err) {
    return tripErrorResponse(err);
  }
}
