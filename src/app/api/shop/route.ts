// Owner: P4 - Game Layer & Map (see TEAM.md)
//   GET /api/shop -> { balance, rewards: [{ key, title, description, cost, icon }], vouchers: [...] }
// The Rewards page: your points, what you can spend them on, and what you've redeemed.
// See src/features/gamification/shop.ts.
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { getShop } from "@/features/gamification";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return Response.json(await getShop(db, auth.userId), { headers: { "cache-control": "no-store" } });
}
