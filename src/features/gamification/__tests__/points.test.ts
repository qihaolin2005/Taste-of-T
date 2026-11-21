import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createGuest } from "@/features/auth";
import {
  completeQuest,
  createQuest,
  DEFAULT_QUEST_POINTS,
  getPoints,
  listQuests,
  QuestNotActiveError,
  QuestNotFoundError,
} from "@/features/gamification";

const db = createTestDb();
afterAll(() => db.$disconnect());

const newUser = async () => (await createGuest(db)).id;

/** Invariant: the balance always equals the sum of the points log. */
async function expectBalanceMatchesLog(userId: string) {
  const [user, sum] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } }),
    db.pointsEvent.aggregate({ where: { userId }, _sum: { amount: true } }),
  ]);
  expect(user.xp).toBe(sum._sum.amount ?? 0);
}

describe("points", () => {
  it("new accounts start at 0 with no history", async () => {
    expect(await getPoints(db, await newUser())).toEqual({ total: 0, events: [] });
  });

  it("completing a quest adds its points to the account and logs it", async () => {
    const u = await newUser();
    const q = await createQuest(db, u, { title: "Chinatown Food Quest", stationId: "place-chncl" });
    expect(q).toMatchObject({ points: DEFAULT_QUEST_POINTS, status: "active", completedAt: null });

    const r = await completeQuest(db, u, q.id);
    expect(r).toMatchObject({ awarded: DEFAULT_QUEST_POINTS, alreadyCompleted: false, total: DEFAULT_QUEST_POINTS });
    expect(r.quest.status).toBe("completed");
    expect(r.quest.completedAt).not.toBeNull();

    const p = await getPoints(db, u);
    expect(p.total).toBe(DEFAULT_QUEST_POINTS);
    expect(p.events).toEqual([expect.objectContaining({ amount: DEFAULT_QUEST_POINTS, reason: "quest_completed", questId: q.id, questTitle: "Chinatown Food Quest" })]);
    await expectBalanceMatchesLog(u);
  });

  it("adds up across quests, using each quest's own point value", async () => {
    const u = await newUser();
    const a = await createQuest(db, u, { title: "A" });
    const b = await createQuest(db, u, { title: "B", points: 250 }); // e.g. set by the future ML model
    await completeQuest(db, u, a.id);
    const r = await completeQuest(db, u, b.id);
    expect(r.total).toBe(DEFAULT_QUEST_POINTS + 250);
    expect((await getPoints(db, u)).events.map((e) => e.amount)).toEqual([250, DEFAULT_QUEST_POINTS]); // newest first
    await expectBalanceMatchesLog(u);
  });

  it("never pays out twice: completing again awards 0", async () => {
    const u = await newUser();
    const q = await createQuest(db, u, { title: "Once" });
    await completeQuest(db, u, q.id);
    const again = await completeQuest(db, u, q.id);
    expect(again).toMatchObject({ awarded: 0, alreadyCompleted: true, total: DEFAULT_QUEST_POINTS });
    expect(await db.pointsEvent.count({ where: { questId: q.id } })).toBe(1);
  });

  it("never pays out twice even when completed at the same moment (double tap, two phones)", async () => {
    const u = await newUser();
    const q = await createQuest(db, u, { title: "Race" });
    const results = await Promise.all(Array.from({ length: 5 }, () => completeQuest(db, u, q.id)));
    expect(results.filter((r) => r.awarded > 0)).toHaveLength(1);
    expect((await getPoints(db, u)).total).toBe(DEFAULT_QUEST_POINTS);
    await expectBalanceMatchesLog(u);
  });

  it("can't complete someone else's quest or an unknown one", async () => {
    const owner = await newUser();
    const other = await newUser();
    const q = await createQuest(db, owner, { title: "Mine" });
    await expect(completeQuest(db, other, q.id)).rejects.toBeInstanceOf(QuestNotFoundError);
    await expect(completeQuest(db, other, "nope")).rejects.toBeInstanceOf(QuestNotFoundError);
    expect((await getPoints(db, other)).total).toBe(0);
    expect((await getPoints(db, owner)).total).toBe(0);
  });

  it("abandoned quests can't be completed", async () => {
    const u = await newUser();
    const q = await createQuest(db, u, { title: "Gave up" });
    await db.quest.update({ where: { id: q.id }, data: { status: "abandoned" } });
    await expect(completeQuest(db, u, q.id)).rejects.toBeInstanceOf(QuestNotActiveError);
    expect((await getPoints(db, u)).total).toBe(0);
  });

  it("rejects zero, negative, or fractional point values", async () => {
    const u = await newUser();
    for (const points of [0, -50, 12.5]) await expect(createQuest(db, u, { title: "Bad", points })).rejects.toThrow("Invalid quest points");
  });

  it("lists quests by status", async () => {
    const u = await newUser();
    const a = await createQuest(db, u, { title: "Done" });
    await createQuest(db, u, { title: "Open" });
    await completeQuest(db, u, a.id);
    expect((await listQuests(db, u, "active")).map((q) => q.title)).toEqual(["Open"]);
    expect((await listQuests(db, u, "completed")).map((q) => q.title)).toEqual(["Done"]);
  });

  it("deleting an account deletes its quests and points log", async () => {
    const u = await newUser();
    const q = await createQuest(db, u, { title: "Bye" });
    await completeQuest(db, u, q.id);
    await db.user.delete({ where: { id: u } });
    expect(await db.quest.count({ where: { userId: u } })).toBe(0);
    expect(await db.pointsEvent.count({ where: { userId: u } })).toBe(0);
  });
});
