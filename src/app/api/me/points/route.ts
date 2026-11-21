// Owner: P4 - Game Layer & Map (see TEAM.md)
//   GET /api/me/points -> { total, events: [{ amount, reason, questTitle, createdAt, ... }] }
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { getPoints } from "@/features/gamification";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return Response.json(await getPoints(db, auth.userId), { headers: { "cache-control": "no-store" } });
}
