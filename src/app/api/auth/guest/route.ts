// Owner: P2 - Data & Integrations (see TEAM.md)
//   POST /api/auth/guest -> 201 { user }
// "Continue as guest": a real user without email. Still goes through onboarding, and can
// sign up later (POST /api/auth/signup) without losing progress.
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { setSession } from "@/lib/session";
import { createGuest } from "@/features/auth";

export async function POST(req: Request) {
  if (!rateLimit(`guest:${clientIp(req)}`, 30, 15 * 60_000)) return apiError("too_many_requests", "Too many attempts. Try again in a few minutes.");
  const user = await createGuest(db);
  await setSession(user.id, false);
  return Response.json({ user }, { status: 201 });
}
