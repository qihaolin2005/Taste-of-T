// Owner: P2 - Data & Integrations (see TEAM.md)
// Route Handler guard: resolve the session cookie to an existing user, or return a 401.
//   const auth = await requireUser(); if ("response" in auth) return auth.response;
import "server-only";
import { apiError } from "./api";
import { db } from "./db";
import { getSessionUserId } from "./session";

export async function requireUser(): Promise<{ userId: string } | { response: Response }> {
  const userId = await getSessionUserId();
  if (!userId) return { response: apiError("unauthorized", "Please sign in.") };
  const exists = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) return { response: apiError("unauthorized", "Your session expired. Please sign in again.") };
  return { userId };
}
