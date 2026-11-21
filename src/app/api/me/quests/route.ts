// Owner: P4 - Game Layer & Map (see TEAM.md)
//   GET  /api/me/quests?status=active -> { quests }
//   POST /api/me/quests { title, stationId? } -> 201 { quest }
// The quest's point value is set by the server (pointsForQuest), never by the request.
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { isKnownStation } from "@/lib/mbta/stations";
import { rateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { createQuest, listQuests } from "@/features/gamification";

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    stationId: z.string().min(1).max(64).refine(isKnownStation, "Unknown station id").optional(),
  })
  .strict();

const statusSchema = z.enum(["active", "completed", "abandoned"]).optional();

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const status = statusSchema.safeParse(new URL(req.url).searchParams.get("status") ?? undefined);
  if (!status.success) return apiError("bad_request", "status must be active, completed, or abandoned");
  return Response.json({ quests: await listQuests(db, auth.userId, status.data) });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  // Completion isn't verified yet (no check-in), so cap creation to limit point farming.
  if (!rateLimit(`quest-create:${auth.userId}`, 20, 24 * 60 * 60_000)) return apiError("too_many_requests", "That's a lot of quests for one day. Try again tomorrow.");
  const body = await parseBody(req, createSchema);
  if ("response" in body) return body.response;
  return Response.json({ quest: await createQuest(db, auth.userId, body.data) }, { status: 201 });
}
