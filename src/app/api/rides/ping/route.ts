// Owner: P2 - Data & Integrations (see TEAM.md)
//   POST /api/rides/ping { lat, lng, accuracyM?, rideId? } -> RideView
// Send while riding a bus or T (every ~30 s; src/features/rides/client.ts does this). Each ping is
// matched against live MBTA vehicle positions. When the ride is verified, send its `id` as
// `travel.rideId` with a reward claim. Pings themselves aren't stored.
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { getLiveTransitVehicles, routeName } from "@/lib/mbta/liveVehicles";
import { rateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { recordPing } from "@/features/rides";

const pingSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(100_000).optional(),
    rideId: z.string().min(1).max(40).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  // ~30 s is plenty; this allows a ping every ~7.5 s at most.
  if (!rateLimit(`ride-ping:${auth.userId}`, 8, 60_000)) return apiError("too_many_requests", "Pinging too often. Every 30 seconds is enough.");
  const body = await parseBody(req, pingSchema);
  if ("response" in body) return body.response;

  let vehicles;
  try {
    vehicles = await getLiveTransitVehicles();
  } catch {
    return apiError("unavailable", "Can't reach the MBTA right now. We'll try again on your next ping.");
  }
  const { rideId, ...ping } = body.data;
  return Response.json(await recordPing(db, auth.userId, ping, { vehicles, routeName: (id) => routeName(id) }, rideId));
}
