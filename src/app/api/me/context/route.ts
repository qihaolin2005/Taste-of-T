// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
//   GET /api/me/context -> { context, features }
// Exactly what an ML model is given about the current user. Useful for debugging the model,
// and for transparency (a "what does the app know about me?" screen).
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { buildUserContext, toFeatures } from "@/features/ml";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const context = await buildUserContext(db, auth.userId);
  if (!context) return apiError("not_found", "User not found");
  return Response.json({ context, features: toFeatures(context) });
}
