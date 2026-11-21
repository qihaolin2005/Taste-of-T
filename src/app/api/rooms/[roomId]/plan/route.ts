// Owner: P3 - Group Mode & App Shell (see TEAM.md)
//   GET /api/rooms/BHSG/plan -> { plan: SquadPlan | null, status }
// The squad's saved top 5 from the swipe session (null until swiping finishes).
// A timed itinerary (generatePlan, the planner) isn't built yet, so there's no POST.
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { getLiveState, roomCodeOr404, squadErrorResponse } from "@/features/squads";

export async function GET(_req: Request, ctx: RouteContext<"/api/rooms/[roomId]/plan">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const room = roomCodeOr404((await ctx.params).roomId);
  if ("response" in room) return room.response;
  try {
    const live = await getLiveState(db, room.code, auth.userId);
    return Response.json({ plan: live.plan, status: live.status }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return squadErrorResponse(err);
  }
}
