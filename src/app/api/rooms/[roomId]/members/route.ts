// Owner: P3 - Group Mode & App Shell (see TEAM.md)
//   POST   /api/rooms/BHSG/members { name, startStationId, homeStationId, budget, leaveBy?, maxWalkMinutes? }
//          -> RoomView. Joins, or updates your info if you're already in. 409 if the room is full.
//   DELETE /api/rooms/BHSG/members -> 204, leave the room
import { parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { joinRoom, leaveRoom, memberInputSchema } from "@/features/rooms";
import { roomErrorResponse, tooManyMisses } from "@/features/rooms/http";

export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[roomId]/members">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const ip = clientIp(req);
  const limited = tooManyMisses(ip);
  if (limited) return limited;
  const body = await parseBody(req, memberInputSchema);
  if ("response" in body) return body.response;
  const { roomId } = await ctx.params;
  try {
    return Response.json(await joinRoom(db, roomId, auth.userId, body.data));
  } catch (err) {
    return roomErrorResponse(err, ip);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/rooms/[roomId]/members">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { roomId } = await ctx.params;
  await leaveRoom(db, roomId, auth.userId);
  return new Response(null, { status: 204 });
}
