// Owner: P4 - Game Layer & Map (see TEAM.md)
// Solo quests and their payout. Spin the T (P1) creates quests with createQuest(); the app
// marks them done with completeQuest(), which adds the quest's points to the account once.
import { Prisma } from "@/generated/prisma/client";
import { awardPointsTx, pointsForQuest, type Db } from "./points";

export type QuestView = {
  id: string;
  title: string;
  stationId: string | null;
  points: number;
  status: "active" | "completed" | "abandoned";
  createdAt: string;
  completedAt: string | null;
};

export type CompleteResult = {
  quest: QuestView;
  /** Points added by THIS call (0 if the quest was already completed). */
  awarded: number;
  alreadyCompleted: boolean;
  total: number;
};

export class QuestNotFoundError extends Error {
  constructor() {
    super("Quest not found");
  }
}
export class QuestNotActiveError extends Error {
  constructor() {
    super("This quest was abandoned and can't be completed");
  }
}

type QuestRow = { id: string; title: string; stationId: string | null; points: number; status: string; createdAt: Date; completedAt: Date | null };
const toView = (q: QuestRow): QuestView => ({
  id: q.id,
  title: q.title,
  stationId: q.stationId,
  points: q.points,
  status: q.status as QuestView["status"],
  createdAt: q.createdAt.toISOString(),
  completedAt: q.completedAt?.toISOString() ?? null,
});

/** `points` is for server callers (e.g. the future ML model); the API never passes it. */
export async function createQuest(db: Db, userId: string, input: { title: string; stationId?: string | null; points?: number }): Promise<QuestView> {
  const points = input.points ?? pointsForQuest(input);
  if (!Number.isInteger(points) || points <= 0) throw new Error(`Invalid quest points: ${points}`);
  const q = await db.quest.create({ data: { userId, title: input.title, stationId: input.stationId ?? null, points } });
  return toView(q);
}

export async function listQuests(db: Db, userId: string, status?: QuestView["status"]): Promise<QuestView[]> {
  const rows = await db.quest.findMany({ where: { userId, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map(toView);
}

/**
 * Complete a quest and add its points to the account, exactly once.
 * Safe to call twice (double tap, retry, two devices): the second call awards 0.
 * The status flip, the points log row, and the total all commit together or not at all.
 */
export async function completeQuest(db: Db, userId: string, questId: string): Promise<CompleteResult> {
  const quest = await db.quest.findFirst({ where: { id: questId, userId } });
  if (!quest) throw new QuestNotFoundError();
  if (quest.status === "abandoned") throw new QuestNotActiveError();

  try {
    const result = await db.$transaction(async (tx) => {
      // Only one caller can flip active -> completed; everyone else sees count 0.
      const flipped = await tx.quest.updateMany({ where: { id: questId, userId, status: "active" }, data: { status: "completed", completedAt: new Date() } });
      if (flipped.count === 0) return null;
      const total = await awardPointsTx(tx, userId, quest.points, "quest_completed", questId);
      const done = await tx.quest.findUniqueOrThrow({ where: { id: questId } });
      return { quest: toView(done), awarded: quest.points, alreadyCompleted: false, total };
    });
    return result ?? (await alreadyDone(db, userId, questId));
  } catch (err) {
    // Lost a race on the unique questId in PointsEvent: someone else already paid it out.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return alreadyDone(db, userId, questId);
    throw err;
  }
}

async function alreadyDone(db: Db, userId: string, questId: string): Promise<CompleteResult> {
  const [q, user] = await Promise.all([db.quest.findUniqueOrThrow({ where: { id: questId } }), db.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } })]);
  return { quest: toView(q), awarded: 0, alreadyCompleted: true, total: user.xp };
}
