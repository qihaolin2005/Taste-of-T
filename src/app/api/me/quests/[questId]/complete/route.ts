// Owner: P4 - Game Layer & Map (see TEAM.md)
//   POST /api/me/quests/:questId/complete -> { quest, awarded, alreadyCompleted, total }
// Adds the quest's points to the account once. Calling it again returns awarded: 0.
// TODO(P4): require a check-in at the quest's station before paying out.
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { completeQuest, QuestNotActiveError, QuestNotFoundError } from "@/features/gamification";

export async function POST(_req: Request, ctx: RouteContext<"/api/me/quests/[questId]/complete">) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { questId } = await ctx.params;
  try {
    return Response.json(await completeQuest(db, auth.userId, questId));
  } catch (err) {
    if (err instanceof QuestNotFoundError) return apiError("not_found", err.message);
    if (err instanceof QuestNotActiveError) return apiError("conflict", err.message);
    throw err;
  }
}
