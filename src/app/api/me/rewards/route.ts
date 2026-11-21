// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
//   GET /api/me/rewards -> { xp, visits: [{ placeId, day, points, groupMultiplier, travelMode, breakdown, ... }] }
// Your XP total and your 20 most recent rewarded visits, with how each one's points were made up.
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { getRewards } from "@/features/rewards";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const rewards = await getRewards(db, auth.userId);
  if (!rewards) return apiError("not_found", "User not found");
  return Response.json(rewards, { headers: { "cache-control": "no-store" } });
}
