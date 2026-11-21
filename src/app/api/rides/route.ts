// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET /api/rides -> { rides } (last 24 h: status, mode, route, whether it already earned points)
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { listRides } from "@/features/rides";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return Response.json({ rides: await listRides(db, auth.userId) }, { headers: { "cache-control": "no-store" } });
}
