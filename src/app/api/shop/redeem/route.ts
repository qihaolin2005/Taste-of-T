// Owner: P4 - Game Layer & Map (see TEAM.md)
//   POST /api/shop/redeem { rewardKey } -> 201 { voucher: { code, reward, expiresAt, ... }, balance }
//     -> 409 when you don't have enough points, 404 for an unknown reward
// Spends points on a reward. The cost comes from the server's list, never from the client.
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { redeemReward, ShopError } from "@/features/gamification";

const bodySchema = z.object({ rewardKey: z.string().min(1).max(60) }).strict();

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!rateLimit(`redeem:${auth.userId}`, 10, 60_000)) return apiError("too_many_requests", "Slow down a little. Try again in a minute.");
  const body = await parseBody(req, bodySchema);
  if ("response" in body) return body.response;
  try {
    return Response.json(await redeemReward(db, auth.userId, body.data.rewardKey), { status: 201 });
  } catch (err) {
    if (err instanceof ShopError) return apiError(err.code === "not_found" ? "not_found" : "conflict", err.message);
    throw err;
  }
}
