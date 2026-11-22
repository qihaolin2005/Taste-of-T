// Owner: P4 - Game Layer & Map (see TEAM.md)
// Rewards: spend points on perks (free coffee, $5 off a meal...). Shown on /rewards.
//
// Redeeming spends points the same way earning adds them: one points history entry (a negative
// amount, reason "redeem:<reward key>") and the balance (User.xp) goes down, in ONE transaction
// that first checks there are enough points. So the balance still equals the sum of the history.
// The voucher code shown at the counter comes from that entry; vouchers last 30 days.
// The partners are examples for the demo: there are no real partner deals behind them yet.
import type { PrismaClient } from "@/generated/prisma/client";
import type { GameIconName } from "./achievements";

type Db = PrismaClient;

export type Reward = {
  key: string;
  title: string;
  description: string;
  cost: number;
  icon: GameIconName;
};

export const REWARDS: readonly Reward[] = [
  { key: "free-coffee", title: "Free Coffee", description: "Any small drip coffee or tea at a partner café.", cost: 250, icon: "coffee" },
  { key: "free-dessert", title: "Free Dessert", description: "A cannoli, a scoop, or a slice of cake at a partner spot.", cost: 450, icon: "cake" },
  { key: "five-off", title: "$5 Off a Meal", description: "$5 off any bill of $20 or more at a partner restaurant.", cost: 500, icon: "tag" },
  { key: "bluebikes-day", title: "Bluebikes Day Pass", description: "A day of Bluebikes rides to get to dinner (or dessert).", cost: 800, icon: "bike" },
  { key: "group-ten-off", title: "$10 Off for Your Group", description: "$10 off your group's bill on an adventure of 3 or more.", cost: 1000, icon: "group" },
];

export const VOUCHER_DAYS = 30;
const REDEEM_PREFIX = "redeem:";

export function rewardByKey(key: string): Reward | undefined {
  return REWARDS.find((r) => r.key === key);
}

/** Points history reason for redeeming this reward. */
export const redeemReason = (rewardKey: string) => `${REDEEM_PREFIX}${rewardKey}`;
/** The reward a points history reason was for, if it was a redemption. */
export const redeemedKey = (reason: string) => (reason.startsWith(REDEEM_PREFIX) ? reason.slice(REDEEM_PREFIX.length) : null);

/** "TOT-7KQ2-9XHM": easy to read out at a counter, from the history entry's id. */
export function voucherCode(eventId: string): string {
  const s = eventId.replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase().padStart(8, "X");
  return `TOT-${s.slice(0, 4)}-${s.slice(4)}`;
}

export type Voucher = { id: string; code: string; reward: Reward; redeemedAt: string; expiresAt: string; expired: boolean };

export class ShopError extends Error {
  constructor(
    public code: "not_found" | "not_enough_points",
    message: string,
  ) {
    super(message);
    this.name = "ShopError";
  }
}

function toVoucher(e: { id: string; reason: string; createdAt: Date }, now: Date): Voucher | null {
  const reward = rewardByKey(redeemedKey(e.reason) ?? "");
  if (!reward) return null;
  const expires = new Date(e.createdAt.getTime() + VOUCHER_DAYS * 86_400_000);
  return { id: e.id, code: voucherCode(e.id), reward, redeemedAt: e.createdAt.toISOString(), expiresAt: expires.toISOString(), expired: expires <= now };
}

/** Spend points on a reward. Returns the voucher and the new balance. */
export async function redeemReward(db: Db, userId: string, rewardKey: string, now = new Date()): Promise<{ voucher: Voucher; balance: number }> {
  const reward = rewardByKey(rewardKey);
  if (!reward) throw new ShopError("not_found", "That reward doesn't exist.");
  return db.$transaction(async (tx) => {
    // Checked and spent in one transaction, so two quick taps can't spend the same points twice.
    const user = await tx.user.findUnique({ where: { id: userId }, select: { xp: true } });
    const balance = user?.xp ?? 0;
    if (balance < reward.cost) throw new ShopError("not_enough_points", `You need ${(reward.cost - balance).toLocaleString("en-US")} more points for this.`);
    const event = await tx.pointsEvent.create({ data: { userId, amount: -reward.cost, reason: redeemReason(reward.key), createdAt: now } });
    const after = await tx.user.update({ where: { id: userId }, data: { xp: { decrement: reward.cost } }, select: { xp: true } });
    return { voucher: toVoucher(event, now)!, balance: after.xp };
  });
}

/** Your balance, everything you can redeem, and your vouchers (newest first). */
export async function getShop(db: Db, userId: string, now = new Date()): Promise<{ balance: number; rewards: readonly Reward[]; vouchers: Voucher[] }> {
  const [user, events] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { xp: true } }),
    db.pointsEvent.findMany({ where: { userId, reason: { startsWith: REDEEM_PREFIX } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { balance: user?.xp ?? 0, rewards: REWARDS, vouchers: events.flatMap((e) => toVoucher(e, now) ?? []) };
}
