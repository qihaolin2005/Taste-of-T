// Owner: P3 - Group Mode & App Shell (see TEAM.md)
//   GET /api/rooms/BHSG -> RoomView (polled every few seconds by the room page)
// Code is case-insensitive. 404 for unknown or expired codes.
import { db } from "@/lib/db";
import { clientIp } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { getRoomView } from "@/features/rooms";
import { roomErrorResponse, tooManyMisses } from "@/features/rooms/http";

export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[roomId]">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const ip = clientIp(req);
  const limited = tooManyMisses(ip);
  if (limited) return limited;
  const { roomId } = await ctx.params;
  try {
    return Response.json(await getRoomView(db, roomId, auth.userId), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return roomErrorResponse(err, ip);
  }
}
