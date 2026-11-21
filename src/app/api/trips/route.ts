// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET  /api/trips                         -> { trips } (yours, newest first)
//   POST /api/trips { roomId?, placeId? }   -> 201 TripView (starts recording)
// A trip records your path to a restaurant (Strava-style). With `roomId`, your group can see it
// on the group trip map. Destination = `placeId`, or the group plan's #1 pick; arriving there
// finishes the trip. Send points with POST /api/trips/:id/points (src/features/trips/client.ts).
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { listMyTrips, startTrip } from "@/features/trips";
import { resolveDestination, tripErrorResponse } from "@/features/trips/http";

const startSchema = z
  .object({
    roomId: z.string().min(1).max(10).optional(),
    placeId: z.string().min(1).max(200).optional(),
  })
  .strict();

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return Response.json({ trips: await listMyTrips(db, auth.userId) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await parseBody(req, startSchema);
  if ("response" in body) return body.response;
  try {
    const place = await resolveDestination(db, body.data.placeId, body.data.roomId);
    return Response.json(await startTrip(db, auth.userId, { roomId: body.data.roomId, place }), { status: 201 });
  } catch (err) {
    return tripErrorResponse(err);
  }
}
