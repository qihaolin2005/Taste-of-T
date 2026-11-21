// Owner: P4 - Game Layer & Map (see TEAM.md)
//   GET /api/me/stamps -> { stamps: [{ stationId, earnedAt }] }
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { getStamps } from "@/features/gamification/stamps";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return Response.json({ stamps: await getStamps(db, auth.userId) });
}
