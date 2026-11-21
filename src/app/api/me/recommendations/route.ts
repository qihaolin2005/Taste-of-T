// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
//   POST /api/me/recommendations  { candidates: CandidatePlace[] }
//     -> { scores: (number|null)[], model, fallbackReason? }   (same order as candidates)
// Scores candidate places for the current user with the configured model (or the baseline).
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { buildUserContext, candidateSchema, scoreCandidates } from "@/features/ml";

const bodySchema = z.object({ candidates: z.array(candidateSchema).max(200) }).strict();

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await parseBody(req, bodySchema);
  if ("response" in body) return body.response;
  const context = await buildUserContext(db, auth.userId);
  if (!context) return apiError("not_found", "User not found");
  return Response.json(await scoreCandidates(context, body.data.candidates));
}
