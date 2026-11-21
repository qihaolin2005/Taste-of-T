// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
//   POST /api/rooms/BHSG/start -> 201 { deck }   (host only)
// "Start adventure": combines every member's taste + history into a shortlist of 10 for the
// night's first stop and opens swiping. Contract: docs/squad-session-api.md
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { roomCodeOr404, squadErrorResponse, squadPlaces, startAdventure } from "@/features/squads";

export async function POST(_req: Request, ctx: RouteContext<"/api/rooms/[roomId]/start">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const room = roomCodeOr404((await ctx.params).roomId);
  if ("response" in room) return room.response;
  try {
    const deck = await startAdventure(db, room.code, auth.userId, { places: await squadPlaces() });
    return Response.json({ deck }, { status: 201 });
  } catch (err) {
    return squadErrorResponse(err);
  }
}
