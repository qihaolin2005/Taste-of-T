// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
//   POST /api/rooms/BHSG/end -> { plan }   (host only)
// Finish now with whatever swipes are in; the plan is marked complete: false.
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { endAdventure, roomCodeOr404, squadErrorResponse } from "@/features/squads";

export async function POST(_req: Request, ctx: RouteContext<"/api/rooms/[roomId]/end">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const room = roomCodeOr404((await ctx.params).roomId);
  if ("response" in room) return room.response;
  try {
    return Response.json({ plan: await endAdventure(db, room.code, auth.userId) });
  } catch (err) {
    return squadErrorResponse(err);
  }
}
