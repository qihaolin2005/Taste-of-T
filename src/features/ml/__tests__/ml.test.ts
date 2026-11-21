import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { getOrCreateUser, updatePreferences, updateProfile, recordLocation } from "@/features/users";
import { getStations } from "@/lib/mbta/stations";
import {
  baselineModel,
  bostonTime,
  buildUserContext,
  FEATURE_NAMES,
  memberToContext,
  scoreCandidates,
  toFeatures,
  type CandidatePlace,
  type RecommenderModel,
  type UserContext,
} from "@/features/ml";

const db = createTestDb();
afterAll(() => db.$disconnect());

async function userWithPrefs() {
  const { user } = await getOrCreateUser(db, null);
  await updateProfile(db, user.id, { displayName: "Secret Name" });
  await updatePreferences(db, user.id, {
    tastes: ["dumplings", "boba"],
    avoid: ["seafood"],
    dietary: ["vegetarian"],
    defaultBudget: 25,
    maxWalkMinutes: 8,
    homeStationId: "place-harsq",
  });
  return user.id;
}

describe("buildUserContext", () => {
  it("includes preferences and dietary needs, but no name or raw user id", async () => {
    const id = await userWithPrefs();
    const ctx = (await buildUserContext(db, id))!;
    expect(ctx.preferences).toEqual({ tastes: ["dumplings", "boba"], avoid: ["seafood"], dietary: ["vegetarian"], budgetPerPerson: 25, maxWalkMinutes: 8 });
    expect(ctx.stations.homeLines).toEqual(["Red"]);
    const json = JSON.stringify(ctx);
    expect(json).not.toContain(id);
    expect(json).not.toContain("Secret Name");
  });

  it("uses a stable pseudonymous subject id", async () => {
    const id = await userWithPrefs();
    const a = (await buildUserContext(db, id))!;
    const b = (await buildUserContext(db, id))!;
    expect(a.subjectId).toBe(b.subjectId);
    expect(a.subjectId).not.toBe(id);
  });

  it("leaves location out unless the user opted in", async () => {
    const id = await userWithPrefs();
    expect((await buildUserContext(db, id))!.location).toBeNull();
    expect((await buildUserContext(db, id))!.consent.location).toBe(false);
  });

  it("coarsens an opted-in location and keeps the nearest station", async () => {
    const id = await userWithPrefs();
    await updatePreferences(db, id, { shareLocation: true });
    await recordLocation(db, id, { lat: 42.352456, lng: -71.062712, accuracyM: 10 }, getStations());
    const ctx = (await buildUserContext(db, id))!;
    // stored as 42.3525 (4 dp), coarsened to 3 dp for the model
    expect(ctx.location).toMatchObject({ lat: 42.353, lng: -71.063, nearestStationId: "place-chncl" });
  });

  it("drops a location older than 24 hours", async () => {
    const id = await userWithPrefs();
    await updatePreferences(db, id, { shareLocation: true });
    await recordLocation(db, id, { lat: 42.35, lng: -71.06 }, getStations());
    await db.userLocation.update({ where: { userId: id }, data: { recordedAt: new Date(Date.now() - 25 * 3600_000) } });
    expect((await buildUserContext(db, id))!.location).toBeNull();
  });

  it("summarizes history: stamps become visited lines, ratings and wishlist included", async () => {
    const id = await userWithPrefs();
    await db.stamp.createMany({ data: [{ userId: id, stationId: "place-chncl" }, { userId: id, stationId: "place-harsq" }] });
    await db.rating.create({ data: { userId: id, placeId: "p1", score: 9 } });
    await db.wishlistItem.create({ data: { userId: id, placeId: "p2" } });
    const h = (await buildUserContext(db, id))!.history;
    expect(new Set(h.linesVisited)).toEqual(new Set(["Orange", "Red"]));
    expect(h.ratings).toEqual([{ placeId: "p1", score: 9 }]);
    expect(h.wishlistPlaceIds).toEqual(["p2"]);
  });

  it("returns null for an unknown user", async () => {
    expect(await buildUserContext(db, "nope")).toBeNull();
  });
});

describe("bostonTime", () => {
  it("uses Boston local time, including daylight saving", () => {
    expect(bostonTime(new Date("2026-11-21T17:00:00Z"))).toEqual({ localHour: 12, minutesAfterMidnight: 720, dayOfWeek: 6, isWeekend: true }); // EST
    expect(bostonTime(new Date("2026-07-01T16:30:00Z"))).toEqual({ localHour: 12, minutesAfterMidnight: 750, dayOfWeek: 3, isWeekend: false }); // EDT
    expect(bostonTime(new Date("2026-11-22T05:15:00Z")).localHour).toBe(0); // 00:15, not 24:15
  });
});

describe("memberToContext", () => {
  it("builds a context for a room member without an account, keeping dietary needs", () => {
    const ctx = memberToContext({ id: "m1", startStationId: "place-chncl", homeStationId: "place-harsq", budget: 30, tastes: ["ramen"], avoid: [], dietary: ["halal"] });
    expect(ctx.kind).toBe("member");
    expect(ctx.preferences).toMatchObject({ tastes: ["ramen"], dietary: ["halal"], budgetPerPerson: 30 });
    expect(ctx.location).toBeNull();
  });
});

describe("toFeatures", () => {
  const ctx = memberToContext({ id: "m2", startStationId: "place-chncl", homeStationId: "place-harsq", budget: 50, tastes: ["ramen", "made-up-tag"], avoid: ["seafood"], dietary: ["vegan"] }, new Date("2026-11-21T03:00:00Z"));

  it("produces one named value per feature, all finite", () => {
    const f = toFeatures(ctx);
    expect(f.values).toHaveLength(FEATURE_NAMES.length);
    expect(f.values.every(Number.isFinite)).toBe(true);
  });

  it("one-hot encodes tastes, avoids, dietary, and lines", () => {
    const f = toFeatures(ctx);
    const get = (name: string) => f.values[f.names.indexOf(name)];
    expect(get("taste:ramen")).toBe(1);
    expect(get("taste:pizza")).toBe(0);
    expect(get("avoid:seafood")).toBe(1);
    expect(get("diet:vegan")).toBe(1);
    expect(get("home_line:Red")).toBe(1);
    expect(get("budget_norm")).toBe(0.5);
    expect(get("unknown_taste_count")).toBe(0.2);
    expect(get("is_late_night")).toBe(1); // 22:00 Boston
  });
});

describe("scoring", () => {
  const ctx: UserContext = memberToContext({ id: "m3", startStationId: "place-chncl", homeStationId: "place-harsq", budget: 25, tastes: ["dumplings"], avoid: ["seafood"], dietary: ["vegetarian"] });
  const place = (id: string, over: Partial<CandidatePlace> = {}): CandidatePlace => ({ id, category: "dinner", tags: [], pricePerPerson: 15, stationId: "place-chncl", dietary: ["vegetarian"], ...over });

  it("baseline: hard-excludes avoided tags and unmet dietary needs, ranks taste matches first", async () => {
    const candidates = [
      place("match", { tags: ["dumplings"] }),
      place("plain"),
      place("avoided", { tags: ["seafood"] }),
      place("not-veg", { dietary: [] }),
      place("pricey", { tags: ["dumplings"], pricePerPerson: 50 }),
    ];
    const { scores, model } = await scoreCandidates(ctx, candidates, null);
    expect(model).toBe("baseline-v1");
    const [match, plain, avoided, notVeg, pricey] = scores;
    expect(avoided).toBeNull();
    expect(notVeg).toBeNull();
    expect(match!).toBeGreaterThan(plain!);
    expect(pricey!).toBeLessThan(match!);
  });

  it("uses a remote model's scores when it works", async () => {
    const remote: RecommenderModel = { name: "remote:test", score: async (r) => r.candidates.map((_, i) => i * 10) };
    expect(await scoreCandidates(ctx, [place("a"), place("b")], remote)).toEqual({ scores: [0, 10], model: "remote:test" });
  });

  it("falls back to the baseline when the remote model fails", async () => {
    const broken: RecommenderModel = { name: "remote:down", score: async () => { throw new Error("timeout"); } };
    const r = await scoreCandidates(ctx, [place("a", { tags: ["dumplings"] })], broken);
    expect(r.model).toBe(baselineModel.name);
    expect(r.fallbackReason).toContain("timeout");
    expect(r.scores[0]).toBeGreaterThan(0);
  });
});
