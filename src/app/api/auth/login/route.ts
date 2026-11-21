// Owner: P2 - Data & Integrations (see TEAM.md)
//   POST /api/auth/login { email, password } -> { user } | 401
// Rate limited per IP and per email to slow down password guessing.
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { setSession } from "@/lib/session";
import { logIn, logInSchema } from "@/features/auth";

const WINDOW_MS = 15 * 60_000;

export async function POST(req: Request) {
  const body = await parseBody(req, logInSchema);
  if ("response" in body) return body.response;
  const ok = rateLimit(`login-ip:${clientIp(req)}`, 30, WINDOW_MS) && rateLimit(`login-email:${body.data.email}`, 10, WINDOW_MS);
  if (!ok) return apiError("too_many_requests", "Too many attempts. Try again in a few minutes.");

  const user = await logIn(db, body.data);
  if (!user) return apiError("unauthorized", "Wrong email or password.");
  await setSession(user.id, user.onboarded);
  return Response.json({ user });
}
