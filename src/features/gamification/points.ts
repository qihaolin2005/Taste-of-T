// Owner: P4 - Game Layer & Map (see TEAM.md)
// Points: the account's balance (User.xp) plus an append-only log (PointsEvent).
//
// Rules:
//  - Points only change through awardPoints(), which writes the log row and bumps the total in
//    ONE transaction, so the total always equals the sum of the log.
//  - Amounts are decided on the server (see pointsForQuest, and src/features/rewards for
//    restaurant visits), never taken from the client.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { redeemedKey, rewardByKey } from "./shop";

export type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

/**
 * quest_completed:  a solo quest was finished (quests.ts)
 * restaurant_visit: ate at a recommended place, shown with a receipt (src/features/rewards)
 * group_bonus:      more squad-mates ate at the same place, so an earlier visit's bonus went up
 */
export type PointsReason = "quest_completed" | "restaurant_visit" | "group_bonus" | `redeem:${string}`;

export type PointsEventView = {
  id: string;
  amount: number;
  reason: PointsReason;
  /** What to show in the history list, e.g. "Chinatown Food Quest" or "Group bonus · Lantern Dumpling House". */
  title: string;
  questId: string | null;
  questTitle: string | null;
  rewardVisitId: string | null;
  placeName: string | null;
  createdAt: string;
};
export type PointsSummary = { total: number; events: PointsEventView[] };

/**
 * How many points a quest is worth when the caller doesn't say.
 * Spin the T prices its quests by the place (questPoints in src/features/ml: farther pays a
 * bit more, pricier pays a lot more) and passes `points`; this is the fallback for the rest.
 */
export const DEFAULT_QUEST_POINTS = 100;
// The quest has no place to price here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function pointsForQuest(_quest: { title: string; stationId?: string | null }): number {
  return DEFAULT_QUEST_POINTS;
}

/** Add points inside an existing transaction. Returns the new total. Link the quest or reward visit it's for. */
export async function awardPointsTx(tx: Tx, userId: string, amount: number, reason: PointsReason, questId?: string, rewardVisitId?: string): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`Invalid points amount: ${amount}`);
  await tx.pointsEvent.create({ data: { userId, amount, reason, questId: questId ?? null, rewardVisitId: rewardVisitId ?? null } });
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
      include: { quest: { select: { title: true } }, rewardVisit: { select: { placeName: true } } },
    }),
  ]);
  return {
    total: user?.xp ?? 0,
    events: events.map((e) => {
      const reason = e.reason as PointsReason;
      const placeName = e.rewardVisit?.placeName ?? null;
      return {
        id: e.id,
        amount: e.amount,
        reason,
        title: eventTitle(reason, e.quest?.title ?? null, placeName),
        questId: e.questId,
        questTitle: e.quest?.title ?? null,
        rewardVisitId: e.rewardVisitId,
        placeName,
        createdAt: e.createdAt.toISOString(),
      };
    }),
  };
}

function eventTitle(reason: PointsReason, questTitle: string | null, placeName: string | null): string {
  // Spending points on a reward (shop.ts): a negative entry.
  const redeemed = redeemedKey(reason);
  if (redeemed) return `Redeemed · ${rewardByKey(redeemed)?.title ?? "Reward"}`;
  if (reason === "restaurant_visit") return placeName ?? "Restaurant visit";
  if (reason === "group_bonus") return placeName ? `Group bonus · ${placeName}` : "Group bonus";
  return questTitle ?? "Quest completed";
}
