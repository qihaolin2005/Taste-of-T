// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET /api/rooms/BHSG/trips -> { roomId, trips, destination } (members only)
// Everyone's latest trip in the group, for the shared trip map. Other people's paths start
// 200 m from where they really started (privacy zone).
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { listRoomTrips } from "@/features/trips";
import { tripErrorResponse } from "@/features/trips/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/rooms/[roomId]/trips">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { roomId } = await ctx.params;
  try {
    return Response.json(await listRoomTrips(db, auth.userId, roomId), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return tripErrorResponse(err);
  }
}
