import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { getOrCreateUser } from "@/features/users";
import { getRecommendations } from "@/features/ml";
import { ALL_PLACES } from "@/features/ml/recommend/__tests__/fixtures";
import { basePoints, claimVisit, claimVisitSchema, getRewards, groupMultiplier, merchantMatches, REWARDS_CONFIG, RewardError, type ClaimVisitInput } from "@/features/rewards";

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
    const far = await claimVisit(db, u2, claim("p-far", 10, {}, { rideId: await verifiedRide(u2, "bus") }), { now: NOW, placeCoords: { lat: 42.39674, lng: -71.12181 } }); // Davis
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
