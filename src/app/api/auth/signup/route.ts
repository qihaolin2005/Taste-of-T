// Owner: P2 - Data & Integrations (see TEAM.md)
//   POST /api/auth/signup { email, password, displayName? } -> 201 { user }
// If this device is a guest, the guest account is upgraded and keeps its progress.
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { getSessionUserId, setSession } from "@/lib/session";
import { EmailTakenError, signUp, signUpSchema } from "@/features/auth";

export async function POST(req: Request) {
  if (!rateLimit(`signup:${clientIp(req)}`, 10, 15 * 60_000)) return apiError("too_many_requests", "Too many attempts. Try again in a few minutes.");
  const body = await parseBody(req, signUpSchema);
  if ("response" in body) return body.response;
  try {
    const user = await signUp(db, body.data, await getSessionUserId());
    await setSession(user.id, user.onboarded);
    return Response.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof EmailTakenError) return apiError("conflict", err.message);
    throw err;
  }
}
