// Owner: P2 - Data & Integrations (see TEAM.md)
//   POST /api/trips/:id/finish -> TripView (stop recording; safe to call twice)
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { finishTrip } from "@/features/trips";
import { tripErrorResponse } from "@/features/trips/http";

export async function POST(_req: Request, ctx: RouteContext<"/api/trips/[tripId]/finish">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { tripId } = await ctx.params;
  try {
    return Response.json(await finishTrip(db, auth.userId, tripId));
  } catch (err) {
    return tripErrorResponse(err);
  }
}
