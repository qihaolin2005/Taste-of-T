// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET /api/trips/groups -> { groups: GroupTripSummary[] } (your group outings, newest first)
// For My Trips: each group outing opens its group Trip Map (/room/CODE/trips), which stays
// viewable read-only after the group ends.
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { listMyGroupTrips } from "@/features/trips";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return Response.json({ groups: await listMyGroupTrips(db, auth.userId) }, { headers: { "cache-control": "no-store" } });
}
