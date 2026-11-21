// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
//   GET /api/rooms/BHSG/session -> LiveState (poll every ~2 s while swiping)
// Status, the shortlist, everyone's progress, your own swipes, live top 5, and the final plan.
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { getLiveState, roomCodeOr404, squadErrorResponse } from "@/features/squads";

export async function GET(_req: Request, ctx: RouteContext<"/api/rooms/[roomId]/session">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const room = roomCodeOr404((await ctx.params).roomId);
  if ("response" in room) return room.response;
  try {
    return Response.json(await getLiveState(db, room.code, auth.userId), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return squadErrorResponse(err);
  }
}
