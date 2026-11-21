// Owner: P2 - Data & Integrations (see TEAM.md)
// Current user's profile.
//   POST   /api/me  -> get or create the anonymous user, sets the session cookie. Call on app start.
//   GET    /api/me  -> { user, preferences, location }
//   PATCH  /api/me  -> update { displayName?, avatar? }
//   DELETE /api/me  -> delete the user and all their data, clear the cookie
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { clearSession, getSessionUserId, setSession } from "@/lib/session";
import { deleteUser, getLocation, getOrCreateUser, getPreferences, getUser, profileUpdateSchema, updateProfile } from "@/features/users";

export async function POST() {
  const { user, created } = await getOrCreateUser(db, await getSessionUserId());
  await setSession(user.id); // also refreshes the cookie's expiry
  return Response.json({ user, created }, { status: created ? 201 : 200 });
}

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const [user, preferences, location] = await Promise.all([
    getUser(db, auth.userId),
    getPreferences(db, auth.userId),
    getLocation(db, auth.userId),
  ]);
  if (!user) return apiError("not_found", "User not found");
  return Response.json({ user, preferences, location });
}

export async function PATCH(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await parseBody(req, profileUpdateSchema);
  if ("response" in body) return body.response;
  return Response.json({ user: await updateProfile(db, auth.userId, body.data) });
}

export async function DELETE() {
  const userId = await getSessionUserId();
  if (userId) await deleteUser(db, userId);
  await clearSession();
  return new Response(null, { status: 204 });
}
