import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { getOrCreateUser } from "@/features/users";
import { ACHIEVEMENTS, awardPointsTx, getPoints, getShop, redeemReward, REWARDS, ShopError, voucherCode } from "@/features/gamification";

const db = createTestDb();
afterAll(() => db.$disconnect());

const NOW = new Date("2026-11-21T23:30:00Z");

async function userWith(points: number) {
  const id = (await getOrCreateUser(db, null)).user.id;
  if (points > 0) await db.$transaction((tx) => awardPointsTx(tx, id, points, "quest_completed"));
  return id;
}

describe("the lists", () => {
  it("has 5 rewards and the requested achievements, each with a unique key and a positive price", () => {
    expect(REWARDS).toHaveLength(5);
    for (const list of [REWARDS.map((r) => [r.key, r.cost]), ACHIEVEMENTS.map((a) => [a.key, a.points])]) {
      expect(new Set(list.map(([k]) => k)).size).toBe(list.length);
      for (const [, n] of list) expect(n).toBeGreaterThan(0);
    }
    expect(ACHIEVEMENTS.map((a) => a.key)).toEqual(expect.arrayContaining(["take-bus", "take-t", "t-and-bus", "change-lines", "first-adventure", "two-stop-adventure"]));
  });
});

describe("redeeming", () => {
  it("spends the points, logs a negative entry, and gives a voucher good for 30 days", async () => {
    const u = await userWith(600);
    const { voucher, balance } = await redeemReward(db, u, "free-coffee", NOW);
    expect(balance).toBe(350);
    expect(voucher).toMatchObject({ reward: { key: "free-coffee", cost: 250 }, expired: false, expiresAt: "2026-12-21T23:30:00.000Z" });
    expect(voucher.code).toMatch(/^TOT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const points = await getPoints(db, u);
    expect(points.total).toBe(350);
    expect(points.events.find((e) => e.amount < 0)).toMatchObject({ amount: -250, title: "Redeemed · Free Coffee" });
    expect(points.events.reduce((n, e) => n + e.amount, 0)).toBe(points.total); // balance = sum of history
  });

  it("refuses when there aren't enough points, and nothing changes", async () => {
    const u = await userWith(400);
    const err = await redeemReward(db, u, "five-off", NOW).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(ShopError);
    expect(err).toMatchObject({ code: "not_enough_points", message: "You need 100 more points for this." });
    expect((await getPoints(db, u)).total).toBe(400);
  });

  it("can't spend the same points twice, even with two taps at once", async () => {
    const u = await userWith(300);
    const results = await Promise.allSettled([redeemReward(db, u, "free-coffee", NOW), redeemReward(db, u, "free-coffee", NOW)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getPoints(db, u)).total).toBe(50);
  });

  it("rejects unknown rewards", async () => {
    const u = await userWith(5000);
    await expect(redeemReward(db, u, "free-car", NOW)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lists your vouchers newest first, marking expired ones", async () => {
    const u = await userWith(2000);
    await redeemReward(db, u, "free-dessert", new Date("2026-10-01T12:00:00Z"));
    await redeemReward(db, u, "free-coffee", NOW);
    const shop = await getShop(db, u, NOW);
    expect(shop.balance).toBe(1300);
    expect(shop.vouchers.map((v) => [v.reward.key, v.expired])).toEqual([
      ["free-coffee", false],
      ["free-dessert", true],
    ]);
  });

  it("voucher codes are readable and stable", () => {
    expect(voucherCode("cmx1abc2def3ghi4")).toBe("TOT-DEF3-GHI4");
    expect(voucherCode("ab")).toBe("TOT-XXXX-XXAB");
  });
});
