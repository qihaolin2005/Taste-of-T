// Owner: P4 - Game Layer & Map (see TEAM.md)
// Points: the account's balance (User.xp) plus an append-only log (PointsEvent).
//
// Rules:
//  - Points only change through awardPoints(), which writes the log row and bumps the total in
//    ONE transaction, so the total always equals the sum of the log.
//  - Amounts are decided on the server (see pointsForQuest), never taken from the client.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

export type PointsReason = "quest_completed";

export type PointsEventView = { id: string; amount: number; reason: PointsReason; questId: string | null; questTitle: string | null; createdAt: string };
export type PointsSummary = { total: number; events: PointsEventView[] };

/**
 * How many points a quest is worth.
 * TODO(ML): replace with the points model (difficulty, distance, new line, time of night...).
 * Until then every quest is worth the same.
 */
export const DEFAULT_QUEST_POINTS = 100;
// The quest is unused until the ML model lands; it's the input that model will need.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function pointsForQuest(_quest: { title: string; stationId?: string | null }): number {
  return DEFAULT_QUEST_POINTS;
}

/** Add points inside an existing transaction. Returns the new total. */
export async function awardPointsTx(tx: Tx, userId: string, amount: number, reason: PointsReason, questId?: string): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`Invalid points amount: ${amount}`);
  await tx.pointsEvent.create({ data: { userId, amount, reason, questId: questId ?? null } });
  const user = await tx.user.update({ where: { id: userId }, data: { xp: { increment: amount } }, select: { xp: true } });
  return user.xp;
}

export async function getPoints(db: Db, userId: string, limit = 20): Promise<PointsSummary> {
  const [user, events] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { xp: true } }),
    db.pointsEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { quest: { select: { title: true } } },
    }),
  ]);
  return {
    total: user?.xp ?? 0,
    events: events.map((e) => ({
      id: e.id,
      amount: e.amount,
      reason: e.reason as PointsReason,
      questId: e.questId,
      questTitle: e.quest?.title ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
