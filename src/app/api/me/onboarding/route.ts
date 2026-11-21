// Owner: P2 - Data & Integrations (see TEAM.md)
//   POST /api/me/onboarding { dietary: DietaryNeed[], avoid?: string[], displayName? } -> { user }
// Saves first-run answers and marks onboarding done (the proxy stops redirecting to /onboarding).
import { parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { setOnboarded } from "@/lib/session";
import { completeOnboarding, onboardingSchema } from "@/features/auth";

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await parseBody(req, onboardingSchema);
  if ("response" in body) return body.response;
  const user = await completeOnboarding(db, auth.userId, body.data);
  await setOnboarded(true);
  return Response.json({ user });
}
