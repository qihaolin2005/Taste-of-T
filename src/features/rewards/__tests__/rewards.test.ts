import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { getOrCreateUser } from "@/features/users";
import { getRecommendations } from "@/features/ml";
import { completeQuest, createQuest, getPoints } from "@/features/gamification";
import { ALL_PLACES } from "@/features/ml/recommend/__tests__/fixtures";
import { basePoints, claimVisit, fixIsNear, claimVisitSchema, getRewards, groupMultiplier, listClaimablePlaces, visitsLeftToday, merchantMatches, REWARDS_CONFIG, RewardError, type ClaimVisitInput } from "@/features/rewards";

const db = createTestDb();
afterAll(() => db.$disconnect());

const NOW = new Date("2026-11-21T23:30:00Z"); // 6:30 pm in Boston
const minsAgo = (m: number, from = NOW) => new Date(from.getTime() - m * 60_000).toISOString();
const daysLater = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

async function newUser() {
  return (await getOrCreateUser(db, null)).user.id;
}
async function recommend(userId: string, placeId: string, at = NOW) {
  await db.recommendationShown.upsert({ where: { userId_placeId: { userId, placeId } }, create: { userId, placeId, shownAt: at }, update: { shownAt: at } });
}
/** A ride as the MBTA check (src/features/rides) leaves it once verified. */
async function verifiedRide(userId: string, mode: "bus" | "t", opts: { minutesAgo?: number; status?: string } = {}) {
  const at = new Date(NOW.getTime() - (opts.minutesAgo ?? 40) * 60_000);
  const r = await db.ride.create({
    data: {
      userId, status: opts.status ?? "verified", mode, routeId: mode === "bus" ? "1" : "Red", routeName: mode === "bus" ? "Bus 1" : "Red Line",
      vehicleId: "v1", matchedPings: 3, firstMatchAt: new Date(at.getTime() - 5 * 60_000), lastMatchAt: at, verifiedAt: at,
      startLat: 42.37, startLng: -71.12, endLat: 42.3526, endLng: -71.0628, distanceM: 2500,
    },
  });
  return r.id;
}
const claim = (placeId: string, total: number, extra: Partial<ClaimVisitInput["receipt"]> = {}, travel?: ClaimVisitInput["travel"]): ClaimVisitInput => ({
  placeId,
  receipt: { total, date: minsAgo(30), ...extra },
  ...(travel ? { travel } : {}),
});
const expectReward = async (p: Promise<unknown>, code: string, msg?: RegExp) => {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(RewardError);
  expect(err.code).toBe(code);
  if (msg) expect(err.message).toMatch(msg);
};

// ------------------------------------------------------------- points math

describe("points", () => {
  const pts = (receiptTotal: number, dinersOnReceipt: number, travelMode: "bus" | "t" | "none", previousVisits: number) =>
    basePoints({ receiptTotal, dinersOnReceipt, travelMode, previousVisits });

  it("matches the worked examples", () => {
    // Squad of 6, all bus, $30 each, first visit: (20 + 15 + 10 + 10) x 1.25 = 69
    expect(Math.round(pts(180, 6, "bus", 0).base * groupMultiplier(6))).toBe(69);
    // Solo, T, $15, third visit: (20 + 7.5 + 5) x 0.5 = 16
    expect(pts(15, 1, "t", 2).base).toBe(16);
    // Squad of 12, all T, $60 each, first visit: (20 + 30 + 5 + 10) x 1.55 = 101
    expect(Math.round(pts(720, 12, "t", 0).base * groupMultiplier(12))).toBe(101);
  });

  it("caps spend points per person and splits the bill among diners", () => {
    expect(pts(500, 1, "none", 1).spend).toBe(30); // $500 alone: capped at $60 => 30
    expect(pts(100, 4, "none", 1)).toMatchObject({ perPersonUsd: 25, spend: 12.5 });
  });

  it("travel: bus 10, T 5, nothing otherwise", () => {
    expect([pts(20, 1, "bus", 1).travel, pts(20, 1, "t", 1).travel, pts(20, 1, "none", 1).travel]).toEqual([10, 5, 0]);
  });

  it("first visit bonus once, then repeat visits earn less", () => {
    expect(pts(20, 1, "none", 0)).toMatchObject({ firstVisit: 10, repeatFactor: 1 });
    expect(pts(20, 1, "none", 1)).toMatchObject({ firstVisit: 0, repeatFactor: 1 });
    expect(pts(20, 1, "none", 2).repeatFactor).toBe(0.5);
    expect(pts(20, 1, "none", 7).repeatFactor).toBe(0.25);
  });

  it("group multiplier grows with people who showed up, capped at 12", () => {
    expect([groupMultiplier(1), groupMultiplier(2), groupMultiplier(5), groupMultiplier(12), groupMultiplier(40)]).toEqual([1, 1.05, 1.2, 1.55, 1.55]);
  });

  it("matches abbreviated receipt names to the place", () => {
    expect(merchantMatches("LANTERN DUMPLING HSE #2", "Lantern Dumpling House")).toBe(true);
    expect(merchantMatches("Copley Ramen", "Copley Ramen Bar")).toBe(true);
    expect(merchantMatches("Starbucks #1234", "Lantern Dumpling House")).toBe(false);
    expect(merchantMatches("THE KITCHEN", "Hanover Trattoria")).toBe(false); // only generic words in common
  });
});

// ------------------------------------------------------------- claiming

describe("claimVisit", () => {
  it("awards points for a recommended place and adds them to your XP", async () => {
    const u = await newUser();
    await recommend(u, "p-ramen");
    const r = await claimVisit(db, u, claim("p-ramen", 24, {}, { rideId: await verifiedRide(u, "bus") }), { now: NOW });
    expect(r).toMatchObject({ points: 52, groupMultiplier: 1, groupSize: 1, recommendedVia: "for-you", xp: 52 }); // 20 + 12 + 10 + 10
    expect(r.breakdown).toMatchObject({ meal: 20, spend: 12, travel: 10, firstVisit: 10 });
    expect(await getRewards(db, u)).toMatchObject({ xp: 52, visits: [{ placeId: "p-ramen", points: 52, travelMode: "bus" }] });
  });

  it("gives no travel points for an unverified, someone else's, or too-old ride (but still pays the meal)", async () => {
    const u = await newUser();
    const other = await newUser();
    for (const p of ["p-a", "p-b"]) await recommend(u, p);
    const unverified = await claimVisit(db, u, claim("p-a", 10, {}, { rideId: await verifiedRide(u, "bus", { status: "tracking" }) }), { now: NOW });
    expect(unverified.breakdown.travel).toBe(0);
    expect(unverified.travelNote).toMatch(/wasn't verified/);
    expect(unverified.points).toBeGreaterThan(0);
    const notMine = await claimVisit(db, u, claim("p-b", 10, {}, { rideId: await verifiedRide(other, "bus") }), { now: NOW });
    expect(notMine.travelNote).toMatch(/couldn't find/);
    // (a third claim today would hit the 2-visits-per-day limit, so use a second person)
    const u3 = await newUser();
    await recommend(u3, "p-c");
    const old = await claimVisit(db, u3, claim("p-c", 10, {}, { rideId: await verifiedRide(u3, "t", { minutesAgo: 5 * 60 }) }), { now: NOW });
    expect(old.travelNote).toMatch(/too long ago/);
  });

  it("the client can't claim a mode: the old { mode, verified } shape is rejected", () => {
    expect(() => claimVisitSchema.parse({ placeId: "p", receipt: { total: 10, date: minsAgo(5) }, travel: { mode: "bus", verified: true } })).toThrow();
  });

  it("a ride pays out travel points for one visit only, and must end near the place", async () => {
    const u = await newUser();
    await recommend(u, "p-x");
    await recommend(u, "p-y");
    const ride = await verifiedRide(u, "t");
    const near = { lat: 42.3527, lng: -71.0626 }; // ~20 m from where the ride ended
    const first = await claimVisit(db, u, claim("p-x", 10, {}, { rideId: ride }), { now: NOW, placeCoords: near });
    expect(first.breakdown).toMatchObject({ travel: 5, travelMode: "t" });
    const reused = await claimVisit(db, u, claim("p-y", 10, {}, { rideId: ride }), { now: NOW, placeCoords: near });
    expect(reused.breakdown.travel).toBe(0);
    expect(reused.travelNote).toMatch(/already earned/);

    const u2 = await newUser();
    await recommend(u2, "p-far");
    const davis = { lat: 42.39674, lng: -71.12181 };
    const farClaim = { ...claim("p-far", 10, {}, { rideId: await verifiedRide(u2, "bus") }), presence: { ...davis, accuracyM: 15 } }; // they're at the place now
    const far = await claimVisit(db, u2, farClaim, { now: NOW, placeCoords: davis });
    expect(far.breakdown.travel).toBe(0);
    expect(far.travelNote).toMatch(/km from this restaurant/);
  });

  it("only counts places recommended in the last 48 hours", async () => {
    const u = await newUser();
    await expectReward(claimVisit(db, u, claim("never-shown", 20), { now: NOW }), "forbidden", /recommended/);
    await recommend(u, "old", new Date(NOW.getTime() - 3 * 86_400_000));
    await expectReward(claimVisit(db, u, claim("old", 20), { now: NOW }), "forbidden");
  });

  it("checks the receipt: not in the future, recent, from this restaurant", async () => {
    const u = await newUser();
    await recommend(u, "p1");
    await expectReward(claimVisit(db, u, claim("p1", 20, { date: minsAgo(-60) }), { now: NOW }), "bad_request", /future/);
    await expectReward(claimVisit(db, u, claim("p1", 20, { date: minsAgo(60 * 48) }), { now: NOW }), "bad_request", /36 hours/);
    await expectReward(claimVisit(db, u, claim("p1", 20, { merchantName: "Starbucks" }), { now: NOW, placeName: "Lantern Dumpling House" }), "bad_request", /Lantern/);
    await expect(claimVisit(db, u, claim("p1", 20, { merchantName: "LANTERN DUMPLING" }), { now: NOW, placeName: "Lantern Dumpling House" })).resolves.toBeTruthy();
  });

  it("a receipt can be claimed once per person, by up to the number of diners on it", async () => {
    const [a, b, c] = [await newUser(), await newUser(), await newUser()];
    for (const u of [a, b, c]) await recommend(u, "shared");
    const receipt = { receiptNumber: "CHK-1042", diners: 2 };
    await claimVisit(db, a, claim("shared", 80, receipt), { now: NOW });
    await expectReward(claimVisit(db, a, claim("shared", 80, receipt), { now: NOW }), "conflict", /already claimed/);
    const rb = await claimVisit(db, b, claim("shared", 80, receipt), { now: NOW });
    expect(rb.breakdown.perPersonUsd).toBe(40);
    await expectReward(claimVisit(db, c, claim("shared", 80, receipt), { now: NOW }), "conflict", /Everyone on this receipt/);
  });

  it("limits: once per place per day, 2 rewarded visits per day", async () => {
    const u = await newUser();
    for (const p of ["x", "y", "z"]) await recommend(u, p);
    await claimVisit(db, u, claim("x", 20), { now: NOW });
    await expectReward(claimVisit(db, u, claim("x", 21), { now: NOW }), "conflict", /today/);
    await claimVisit(db, u, claim("y", 20), { now: NOW });
    await expectReward(claimVisit(db, u, claim("z", 20), { now: NOW }), "too_many_requests", /2 rewarded visits/);
  });

  it("repeat visits on later days earn less", async () => {
    const u = await newUser();
    const points: number[] = [];
    for (let d = 0; d < 4; d++) {
      const now = daysLater(d);
      await recommend(u, "fav", now);
      points.push((await claimVisit(db, u, { placeId: "fav", receipt: { total: 20, date: minsAgo(30, now) } }, { now })).points);
    }
    expect(points).toEqual([40, 30, 15, 8]); // (20+10+10)x1, (20+10)x1, x0.5, x0.25 (7.5 rounds up)
    expect((await getRewards(db, u))!.xp).toBe(93);
  });
});

// ------------------------------------------------------------- squads

describe("squad visits", () => {
  let seq = 0;
  async function squadWithPlan(size: number, placeId: string) {
    const users = await Promise.all(Array.from({ length: size }, () => newUser()));
    const roomId = `RW${++seq}`;
    await db.room.create({ data: { id: roomId, name: "Night", hostUserId: users[0], date: "2026-11-21", startTime: 1080, slots: ["dinner"], expiresAt: daysLater(2), status: "planned" } });
    for (const [i, userId] of users.entries())
      await db.roomMember.create({ data: { roomId, userId, name: `M${i}`, startStationId: "place-pktrm", homeStationId: "place-pktrm", budget: 40 } });
    await db.plan.create({ data: { roomId, request: {}, result: { kind: "squad-top5", picks: [{ place: { id: placeId } }, { place: { id: "other" } }] }, createdAt: NOW } });
    return { roomId, users };
  }

  it("a place from the squad's top 5 counts as recommended, without a 'for you' log", async () => {
    const s = await squadWithPlan(2, "sq-pizza");
    const r = await claimVisit(db, s.users[0], claim("sq-pizza", 30), { now: NOW });
    expect(r).toMatchObject({ recommendedVia: "squad", groupSize: 1, groupMultiplier: 1 });
  });

  it("each squad-mate who shows up raises everyone's group bonus, including people who claimed earlier", async () => {
    const s = await squadWithPlan(3, "sq-thai");
    const [a, b, c] = s.users;
    const ra = await claimVisit(db, a, claim("sq-thai", 90, { receiptNumber: "T-1", diners: 3 }), { now: NOW });
    expect(ra).toMatchObject({ points: 45, groupMultiplier: 1 }); // 20 + 15 + 10

    const rb = await claimVisit(db, b, claim("sq-thai", 90, { receiptNumber: "T-1", diners: 3 }), { now: NOW });
    expect(rb).toMatchObject({ groupSize: 2, groupMultiplier: 1.05, points: 47 }); // 45 x 1.05 = 47.25
    const rc = await claimVisit(db, c, claim("sq-thai", 90, { receiptNumber: "T-1", diners: 3 }, { rideId: await verifiedRide(c, "t") }), { now: NOW });
    expect(rc).toMatchObject({ groupSize: 3, groupMultiplier: 1.1, points: 55 }); // (45 + 5) x 1.1

    // a was topped up twice: 45 -> 47 -> 50 (45 x 1.1 = 49.5)
    expect(await getRewards(db, a)).toMatchObject({ xp: 50, visits: [{ points: 50, groupMultiplier: 1.1 }] });
    expect((await getRewards(db, b))!.xp).toBe(50);
  });

  it("only squad-mates at the same place count, and a 12-person squad tops out at x1.55", async () => {
    const s = await squadWithPlan(13, "sq-big");
    let last;
    for (const [i, u] of s.users.entries()) last = await claimVisit(db, u, claim("sq-big", 20, { receiptNumber: `B-${i}` }), { now: NOW });
    expect(last).toMatchObject({ groupSize: 13, groupMultiplier: REWARDS_CONFIG.group.perExtraPerson * 11 + 1 });
  });
});

describe("the 'for you' list records what was recommended", () => {
  it("logs each recommended place, so a visit there can earn points", async () => {
    const u = await newUser();
    await db.userPreferences.update({ where: { userId: u }, data: { usualStartStationId: "place-coecl" } });
    const recs = (await getRecommendations(db, u, { candidates: ALL_PLACES, limit: 3 }, { now: NOW }))!;
    const shown = await db.recommendationShown.findMany({ where: { userId: u } });
    expect(shown.map((s) => s.placeId).sort()).toEqual(recs.results.map((r) => r.placeId).sort());
    const r = await claimVisit(db, u, claim(recs.results[0].placeId, 20), { now: NOW });
    expect(r.recommendedVia).toBe("for-you");
  });
});

describe("rewards in the points history (PointsEvent)", () => {
  const ledgerSum = async (userId: string) => (await db.pointsEvent.aggregate({ where: { userId }, _sum: { amount: true } }))._sum.amount ?? 0;

  it("a visit is a 'restaurant_visit' history entry with the place's name, and the total equals the history", async () => {
    const u = await newUser();
    await recommend(u, "p-lantern");
    await claimVisit(db, u, claim("p-lantern", 24), { now: NOW, placeName: "Lantern Dumpling House" });
    const p = await getPoints(db, u);
    expect(p.total).toBe(42); // 20 meal + 12 spend + 10 first visit (travel is covered by the ride tests)
    expect(p.events).toEqual([expect.objectContaining({ amount: 42, reason: "restaurant_visit", title: "Lantern Dumpling House", placeName: "Lantern Dumpling House" })]);
    expect(await ledgerSum(u)).toBe(p.total);
  });

  it("group top-ups are 'group_bonus' entries, and everyone's total still equals their history", async () => {
    const users = await Promise.all([newUser(), newUser(), newUser()]);
    const roomId = "LEDG";
    await db.room.create({ data: { id: roomId, name: "Night", hostUserId: users[0], date: "2026-11-21", startTime: 1080, slots: ["dinner"], expiresAt: daysLater(2), status: "planned" } });
    for (const [i, userId] of users.entries()) await db.roomMember.create({ data: { roomId, userId, name: `M${i}`, startStationId: "place-pktrm", homeStationId: "place-pktrm", budget: 40 } });
    await db.plan.create({ data: { roomId, request: {}, result: { picks: [{ place: { id: "sq-ledger" } }] }, createdAt: NOW } });
    for (const u of users) await claimVisit(db, u, claim("sq-ledger", 90, { receiptNumber: "L-1", diners: 3 }), { now: NOW, placeName: "Siam Garden" });

    const first = await getPoints(db, users[0]);
    expect(first.events.map((e) => [e.reason, e.amount, e.title]).reverse()).toEqual([
      ["restaurant_visit", 45, "Siam Garden"],
      ["group_bonus", 2, "Group bonus · Siam Garden"], // 45 -> 47 (x1.05)
      ["group_bonus", 3, "Group bonus · Siam Garden"], // 47 -> 50 (x1.1)
    ]);
    for (const u of users) expect(await ledgerSum(u)).toBe((await getPoints(db, u)).total);
  });

  it("earned points never go down when early claimers drop out of the group window", async () => {
    const users = await Promise.all(Array.from({ length: 4 }, () => newUser()));
    const roomId = "WNDW";
    await db.room.create({ data: { id: roomId, name: "Night", hostUserId: users[0], date: "2026-11-21", startTime: 1080, slots: ["dinner"], expiresAt: daysLater(3), status: "planned" } });
    for (const [i, userId] of users.entries()) await db.roomMember.create({ data: { roomId, userId, name: `M${i}`, startStationId: "place-pktrm", homeStationId: "place-pktrm", budget: 40 } });
    await db.plan.create({ data: { roomId, request: {}, result: { picks: [{ place: { id: "sq-window" } }] }, createdAt: NOW } });
    const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
    const go = (u: string, h: number, n: string) => claimVisit(db, u, { placeId: "sq-window", receipt: { total: 20, date: minsAgo(10, at(h)), receiptNumber: n } }, { now: at(h) });
    await go(users[0], 0, "w0");
    await go(users[1], 1, "w1");
    const third = await go(users[2], 2, "w2"); // 3 people -> x1.1
    expect(third.groupMultiplier).toBe(1.1);
    const late = await go(users[3], 13.5, "w3"); // 12 h window now only holds users[2] and users[3]
    expect(late.groupSize).toBe(2);
    const r2 = await getRewards(db, users[2]);
    expect(r2!.visits[0]).toMatchObject({ points: 44, groupMultiplier: 1.1 }); // 40 x 1.1, not lowered to x1.05
    for (const u of users) expect(await ledgerSum(u)).toBe((await getPoints(db, u)).total);
  });

  it("quests and restaurant rewards add up in one balance", async () => {
    const u = await newUser();
    const q = await createQuest(db, u, { title: "Chinatown Food Quest", points: 100 });
    await completeQuest(db, u, q.id);
    await recommend(u, "p-combo");
    await claimVisit(db, u, claim("p-combo", 20), { now: NOW, placeName: "Pearl Tea Bar" });
    const p = await getPoints(db, u);
    expect(p.total).toBe(140); // 100 + (20 + 10 + 10)
    expect(p.events.map((e) => e.title).sort()).toEqual(["Chinatown Food Quest", "Pearl Tea Bar"]);
  });
});

describe("listClaimablePlaces", () => {
  it("lists squad top-5 places first, then 'for you' places, within 48 hours, without duplicates", async () => {
    const u = await newUser();
    const roomId = "CLMB";
    await db.room.create({ data: { id: roomId, name: "Night", hostUserId: u, date: "2026-11-21", startTime: 1080, slots: ["dinner"], expiresAt: daysLater(2), status: "planned" } });
    await db.roomMember.create({ data: { roomId, userId: u, name: "Me", startStationId: "place-pktrm", homeStationId: "place-pktrm", budget: 40 } });
    await db.plan.create({ data: { roomId, request: {}, result: { picks: [{ place: { id: "sq-a", name: "Squad A" } }, { place: { id: "both" } }] }, createdAt: NOW } });
    await recommend(u, "both");
    await recommend(u, "solo-b");
    await recommend(u, "too-old", new Date(NOW.getTime() - 3 * 86_400_000));
    const list = await listClaimablePlaces(db, u, { now: NOW });
    expect(list.map((p) => [p.placeId, p.via])).toEqual([
      ["sq-a", "squad"],
      ["both", "squad"],
      ["solo-b", "for-you"],
    ]);
    expect(list[0].name).toBe("Squad A");
  });

  it("hides places already claimed today and reports how many claims are left", async () => {
    const u = await newUser();
    await recommend(u, "c1");
    await recommend(u, "c2");
    await recommend(u, "c3");
    expect(await visitsLeftToday(db, u, { now: NOW })).toBe(2);
    await claimVisit(db, u, claim("c1", 20), { now: NOW });
    expect((await listClaimablePlaces(db, u, { now: NOW })).map((p) => p.placeId).sort()).toEqual(["c2", "c3"]);
    expect(await visitsLeftToday(db, u, { now: NOW })).toBe(1);
    await claimVisit(db, u, claim("c2", 20), { now: NOW });
    expect(await visitsLeftToday(db, u, { now: NOW })).toBe(0);
  });

  // A spin logs ~50 candidates with one timestamp; the newest-30 cut used to drop the place Spin
  // actually sent you to (Boston Burger missing, the picker showing another restaurant).
  it("keeps your Spin quest's place and the requested place, even among 50 same-time recommendations", async () => {
    const u = await newUser();
    for (let i = 0; i < 50; i++) await recommend(u, `cand-${String(i).padStart(2, "0")}`);
    await recommend(u, "zz-burger");
    await recommend(u, "zz-asked");
    await db.quest.create({ data: { userId: u, title: "Eat at Boston Burger", points: 100, placeId: "zz-burger", placeName: "Boston Burger Company", createdAt: NOW } });
    const list = await listClaimablePlaces(db, u, { now: NOW, include: "zz-asked" });
    expect(list[0]).toMatchObject({ placeId: "zz-asked", via: "for-you" });
    expect(list[1]).toMatchObject({ placeId: "zz-burger", name: "Boston Burger Company", via: "for-you" });
    expect(new Set(list.map((p) => p.placeId)).size).toBe(list.length); // no duplicates
  });

  it("never lists a requested place that wasn't recommended recently (same rule as claiming)", async () => {
    const u = await newUser();
    await recommend(u, "old", new Date(NOW.getTime() - 3 * 86_400_000));
    await db.quest.create({ data: { userId: u, title: "Old quest", points: 100, placeId: "never-shown", placeName: "Never Shown", createdAt: NOW } });
    const list = await listClaimablePlaces(db, u, { now: NOW, include: "old" });
    expect(list.map((p) => p.placeId)).toEqual([]);
    await recommend(u, "claimed");
    await claimVisit(db, u, claim("claimed", 20), { now: NOW });
    expect((await listClaimablePlaces(db, u, { now: NOW, include: "claimed" })).map((p) => p.placeId)).not.toContain("claimed");
  });
});

// ------------------------------------------------------------- were you there?

describe("proof you were at the restaurant", () => {
  const PLACE = { lat: 42.3601, lng: -71.0589 }; // near City Hall
  const at = (dLatM: number) => ({ lat: PLACE.lat + dLatM / 111_320, lng: PLACE.lng }); // dLatM meters north
  const withFix = (placeId: string, fix: { lat: number; lng: number; accuracyM: number }) => ({ ...claim(placeId, 30), presence: fix });

  it("a phone fix near the place (with GPS error allowed) passes; far or too rough fails", () => {
    // The shared GPS check-in (CHECKIN_CONFIG): 150 m + up to 75 m of reported error, fixes up to 500 m.
    expect(fixIsNear({ ...at(100), accuracyM: 10 }, PLACE).ok).toBe(true);
    expect(fixIsNear({ ...at(210), accuracyM: 75 }, PLACE).ok).toBe(true);
    expect(fixIsNear({ ...at(400), accuracyM: 10 }, PLACE)).toMatchObject({ ok: false, reason: expect.stringMatching(/about 400 m away/) });
    expect(fixIsNear({ ...at(10), accuracyM: 800 }, PLACE)).toMatchObject({ ok: false, reason: expect.stringMatching(/too rough/) });
  });

  it("claiming at the restaurant works and records how it was confirmed (not where)", async () => {
    const u = await newUser();
    await recommend(u, "p-here");
    const r = await claimVisit(db, u, withFix("p-here", { ...at(40), accuracyM: 12 }), { now: NOW, placeCoords: PLACE });
    expect(r.verifiedBy).toBe("here");
    const stored = await db.rewardVisit.findUniqueOrThrow({ where: { id: r.visitId } });
    expect(stored.breakdown).toMatchObject({ verifiedBy: "here" });
    expect(JSON.stringify(stored)).not.toContain(String(at(40).lat));
  });

  it("typing a receipt from home is refused", async () => {
    const u = await newUser();
    await recommend(u, "p-home");
    await expectReward(claimVisit(db, u, withFix("p-home", { ...at(3000), accuracyM: 10 }), { now: NOW, placeCoords: PLACE }), "forbidden", /couldn't confirm.*about 1\.9 mi away/);
    await expectReward(claimVisit(db, u, claim("p-home", 30), { now: NOW, placeCoords: PLACE }), "forbidden", /Turn on location/);
    expect(await db.rewardVisit.count({ where: { userId: u } })).toBe(0);
  });

  it("being at the place hours after the receipt isn't proof for that receipt", async () => {
    const u = await newUser();
    await recommend(u, "p-late");
    const old = { ...claim("p-late", 30, { date: minsAgo(5 * 60) }), presence: { ...at(10), accuracyM: 10 } };
    await expectReward(claimVisit(db, u, old, { now: NOW, placeCoords: PLACE }), "forbidden", /more than 3 hours/);
  });

  it("claiming later from home works if a recorded trip passed the place around the receipt time", async () => {
    const u = await newUser();
    await recommend(u, "p-trip");
    const start = new Date(NOW.getTime() - 3 * 3_600_000); // trip started 3 h ago, arrived 20 min later
    await db.trip.create({ data: { userId: u, startedAt: start, lastPointAt: new Date(start.getTime() + 1200_000), points: [[42.35, -71.06, 0], [at(30).lat, at(30).lng, 1200]] } });
    const later = { ...claim("p-trip", 30, { date: minsAgo(150) }), presence: { ...at(5000), accuracyM: 10 } }; // now at home
    const r = await claimVisit(db, u, later, { now: NOW, placeCoords: PLACE });
    expect(r.verifiedBy).toBe("trip");
  });

  it("a verified ride that ended near the place counts; one that ended far away doesn't", async () => {
    const u = await newUser();
    await recommend(u, "p-ride");
    await recommend(u, "p-ride-far");
    await verifiedRide(u, "bus"); // ends at 42.3526, -71.0628: ~950 m from PLACE
    await expectReward(claimVisit(db, u, claim("p-ride-far", 30), { now: NOW, placeCoords: PLACE }), "forbidden");
    const nearStop = { lat: 42.3555, lng: -71.0605 }; // ~170 m from where the ride ended
    const r = await claimVisit(db, u, claim("p-ride", 30), { now: NOW, placeCoords: nearStop });
    expect(r.verifiedBy).toBe("ride");
  });

  it("a place we can't locate isn't checked, and says so", async () => {
    const u = await newUser();
    await recommend(u, "p-unknown");
    expect((await claimVisit(db, u, claim("p-unknown", 30), { now: NOW, placeCoords: null })).verifiedBy).toBe("unchecked");
  });

  it("the location in the request must be a real fix", () => {
    expect(() => claimVisitSchema.parse({ placeId: "p", receipt: { total: 10, date: minsAgo(5) }, presence: { lat: 99, lng: 0, accuracyM: 5 } })).toThrow();
  });
});

// ------------------------------------------------------------- travel points without picking a ride

describe("travel points find your verified ride by themselves", () => {
  const nearStop = { lat: 42.3540, lng: -71.0620 }; // ~170 m from where verifiedRide() ends

  it("a claim that names no ride still gets bus points from the verified ride that ended nearby", async () => {
    const u = await newUser();
    await recommend(u, "p-auto");
    const ride = await verifiedRide(u, "bus");
    const r = await claimVisit(db, u, claim("p-auto", 30), { now: NOW, placeCoords: nearStop });
    expect(r.breakdown).toMatchObject({ travel: REWARDS_CONFIG.travel.bus, travelMode: "bus" });
    expect((await db.rewardVisit.findUniqueOrThrow({ where: { id: r.visitId } })).rideId).toBe(ride);
  });

  it("the same ride isn't picked up again for another visit", async () => {
    const u = await newUser();
    await recommend(u, "p-auto1");
    await recommend(u, "p-auto2");
    await verifiedRide(u, "t");
    expect((await claimVisit(db, u, claim("p-auto1", 30), { now: NOW, placeCoords: nearStop })).breakdown.travel).toBe(REWARDS_CONFIG.travel.t);
    const second = { ...claim("p-auto2", 31), presence: { ...nearStop, accuracyM: 10 } };
    expect((await claimVisit(db, u, second, { now: NOW, placeCoords: nearStop })).breakdown.travel).toBe(0);
  });

  it("a ride that ended far away, or wasn't verified, earns nothing", async () => {
    const u = await newUser();
    await recommend(u, "p-auto-far");
    await verifiedRide(u, "bus");
    await verifiedRide(u, "t", { status: "tracking" });
    const davis = { lat: 42.39674, lng: -71.12181 };
    const r = await claimVisit(db, u, { ...claim("p-auto-far", 30), presence: { ...davis, accuracyM: 10 } }, { now: NOW, placeCoords: davis });
    expect(r.breakdown).toMatchObject({ travel: 0, travelMode: "none" });
  });
});
