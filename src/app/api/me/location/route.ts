// Owner: P2 - Data & Integrations (see TEAM.md)
// Last known location (opt-in via preferences.shareLocation).
//   GET    /api/me/location -> { location | null }
//   PUT    /api/me/location -> { lat, lng, accuracyM? } => stored location + nearest station; 403 if sharing is off
//   DELETE /api/me/location -> forget it
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { getStations } from "@/lib/mbta/stations";
import { requireUser } from "@/lib/requireUser";
import { clearLocation, getLocation, LocationSharingDisabledError, locationUpdateSchema, recordLocation } from "@/features/users";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return Response.json({ location: await getLocation(db, auth.userId) });
}

export async function PUT(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await parseBody(req, locationUpdateSchema);
  if ("response" in body) return body.response;
  try {
    return Response.json({ location: await recordLocation(db, auth.userId, body.data, getStations()) });
  } catch (err) {
    if (err instanceof LocationSharingDisabledError) return apiError("forbidden", err.message);
    throw err;
  }
}

export async function DELETE() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  await clearLocation(db, auth.userId);
  return new Response(null, { status: 204 });
}
