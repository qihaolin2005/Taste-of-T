// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET    /api/trips/:id -> TripView (yours, or a group-mate's while you're both in the group)
//   DELETE /api/trips/:id -> 204 (yours only)
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { deleteTrip, getTrip } from "@/features/trips";
import { tripErrorResponse } from "@/features/trips/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[tripId]">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { tripId } = await ctx.params;
  try {
    return Response.json(await getTrip(db, auth.userId, tripId), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return tripErrorResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/trips/[tripId]">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { tripId } = await ctx.params;
  try {
    await deleteTrip(db, auth.userId, tripId);
    return new Response(null, { status: 204 });
  } catch (err) {
    return tripErrorResponse(err);
  }
}
