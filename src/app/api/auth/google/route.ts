// Owner: P2 - Data & Integrations (see TEAM.md)
//   POST /api/auth/google { credential } -> { user }
// `credential` is the ID token from the Google Identity Services button.
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { getSessionUserId, setSession } from "@/lib/session";
import { GoogleTokenError, signInWithGoogle, verifyGoogleIdToken } from "@/features/auth";

const bodySchema = z.object({ credential: z.string().min(20).max(4096) }).strict();

export async function POST(req: Request) {
  if (!rateLimit(`google:${clientIp(req)}`, 30, 15 * 60_000)) return apiError("too_many_requests", "Too many attempts. Try again in a few minutes.");
  const body = await parseBody(req, bodySchema);
  if ("response" in body) return body.response;
  try {
    const identity = await verifyGoogleIdToken(body.data.credential);
    const user = await signInWithGoogle(db, identity, await getSessionUserId());
    await setSession(user.id, user.onboarded);
    return Response.json({ user });
  } catch (err) {
    if (err instanceof GoogleTokenError) return apiError("unauthorized", err.message);
    throw err;
  }
}
