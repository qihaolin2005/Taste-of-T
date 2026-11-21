// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET   /api/me/preferences -> Preferences
//   PATCH /api/me/preferences -> partial update; send only the fields that changed.
//         Setting shareLocation: false also deletes the stored location.
import { parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { getPreferences, preferencesUpdateSchema, updatePreferences } from "@/features/users";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return Response.json({ preferences: await getPreferences(db, auth.userId) });
}

export async function PATCH(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await parseBody(req, preferencesUpdateSchema);
  if ("response" in body) return body.response;
  return Response.json({ preferences: await updatePreferences(db, auth.userId, body.data) });
}
