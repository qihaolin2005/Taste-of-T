// Owner: P3 - Group Mode & App Shell (see TEAM.md)
//   POST /api/rooms { name, day: "tonight"|"tomorrow", startTime, slots } -> 201 { code }
//     409 if you're already in a live group (one at a time; leave it first)
//   GET  /api/rooms -> { code: string | null }: the group you're in right now (member or host)
// Creates a group with a fresh 4-letter code. The host then joins it like everyone else.
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { createRoom, createRoomSchema, currentRoomCode } from "@/features/rooms";
import { roomErrorResponse } from "@/features/rooms/http";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return Response.json({ code: await currentRoomCode(db, auth.userId) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!rateLimit(`room-create:${clientIp(req)}`, 20, 60 * 60_000)) return apiError("too_many_requests", "You've made a lot of groups. Try again later.");
  const body = await parseBody(req, createRoomSchema);
  if ("response" in body) return body.response;
  try {
    const code = await createRoom(db, auth.userId, body.data);
    return Response.json({ code }, { status: 201 });
  } catch (err) {
    return roomErrorResponse(err, clientIp(req));
  }
}
