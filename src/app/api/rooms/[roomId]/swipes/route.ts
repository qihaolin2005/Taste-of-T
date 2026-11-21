// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
//   POST /api/rooms/BHSG/swipes { placeId, liked } -> { finished, plan }
// One right (liked: true) / left swipe on a shortlist card. Swiping again changes the vote.
// Finishes automatically when everyone still in the squad has swiped all 10.
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { roomCodeOr404, squadErrorResponse, submitSwipe } from "@/features/squads";

const bodySchema = z.object({ placeId: z.string().min(1).max(200), liked: z.boolean() }).strict();

export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[roomId]/swipes">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const room = roomCodeOr404((await ctx.params).roomId);
  if ("response" in room) return room.response;
  const body = await parseBody(req, bodySchema);
  if ("response" in body) return body.response;
  try {
    return Response.json(await submitSwipe(db, room.code, auth.userId, body.data.placeId, body.data.liked));
  } catch (err) {
    return squadErrorResponse(err);
  }
}
