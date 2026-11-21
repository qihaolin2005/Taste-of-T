import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { getOrCreateUser, updatePreferences } from "@/features/users";
import { checkDietary, getRecommendations, loadSeedRestaurants, recommendationsRequestSchema, recordSoloSwipe } from "@/features/ml";
import { ALL_PLACES, COPLEY } from "../recommend/__tests__/fixtures";

const db = createTestDb();
afterAll(() => db.$disconnect());

async function newUser(prefs: Parameters<typeof updatePreferences>[2] = {}) {
  const { user } = await getOrCreateUser(db, null);
  await updatePreferences(db, user.id, { usualStartStationId: "place-coecl", ...prefs }); // Copley
  return user.id;
}

describe("getRecommendations", () => {
  it("returns null for an unknown user", async () => {
    expect(await getRecommendations(db, "nope", { candidates: ALL_PLACES })).toBeNull();
  });

  it("cold start: ranks nearby places from the start station with reasons", async () => {
    const id = await newUser();
    const r = (await getRecommendations(db, id, { candidates: ALL_PLACES, limit: 5 }))!;
    expect(r.model).toBe("content-v1");
    expect(r.origin?.source).toBe("start-station");
    expect(r.confidence).toBe(0);
    expect(r.results).toHaveLength(5);
    expect(r.results.map((x) => x.placeId)).not.toContain("farThai");
    expect(r.results[0].reason).toMatch(/mi away/);
  });

  it("never returns a place that breaks the user's dietary restrictions", async () => {
    const id = await newUser({ dietary: ["vegan"] });
    const r = (await getRecommendations(db, id, { candidates: ALL_PLACES, limit: 50 }))!;
    expect(r.results.length).toBeGreaterThan(0);
    for (const x of r.results) expect(checkDietary(ALL_PLACES.find((p) => p.id === x.placeId)!, ["vegan"]).ok).toBe(true);
    expect(r.counts.dietary).toBeGreaterThan(0);
  });

  it("learns from stored ratings and swipes", async () => {
    const id = await newUser();
    await db.rating.create({ data: { userId: id, placeId: "hsThai", score: 10 } });
    await recordSoloSwipe(db, id, "farThai", true);
    await recordSoloSwipe(db, id, "bbItalian", false);
    const r = (await getRecommendations(db, id, { candidates: ALL_PLACES, limit: 50 }))!;
    expect(r.swipesUsed).toBe(2);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.results.map((x) => x.placeId)).not.toContain("bbItalian"); // disliked
    const thai = r.results.find((x) => x.placeId === "ctThai")!;
    expect(thai.reasons).toContain("you liked other thai places");
  });

  it("supports destination mode and a one-off origin", async () => {
    const id = await newUser();
    const dest = (await getRecommendations(db, id, { candidates: ALL_PLACES, mode: { kind: "destination", neighborhood: "Harvard Square" } }))!;
    expect(dest.results.map((x) => x.placeId).sort()).toEqual(["hsIndian", "hsRamen", "hsThai"]);
    const here = (await getRecommendations(db, id, { candidates: ALL_PLACES, origin: COPLEY, mode: { kind: "nearby", radiusMiles: 1.5 } }))!;
    expect(here.origin?.source).toBe("override");
    expect(here.results.some((x) => x.placeId.startsWith("hs"))).toBe(false);
  });

  it("ranks restaurants from a live source, and says where they came from", async () => {
    const id = await newUser();
    const live = (await getRecommendations(db, id, {}, { source: async () => ALL_PLACES, seed: () => ({ places: [], skipped: 0 }) }))!;
    expect(live.restaurantsFrom).toBe("source");
    expect(live.results.length).toBeGreaterThan(0);
    const down = (await getRecommendations(db, id, {}, { source: async () => { throw new Error("down"); }, seed: () => ({ places: ALL_PLACES, skipped: 0 }) }))!;
    expect(down.restaurantsFrom).toBe("seed");
    expect(down.results.length).toBeGreaterThan(0);
    expect(down.warnings[0]).toMatch(/restaurant source failed \(down\)/);
    const body = (await getRecommendations(db, id, { candidates: ALL_PLACES }, { source: async () => { throw new Error("unused"); } }))!;
    expect(body.restaurantsFrom).toBe("candidates");
    expect(body.warnings).toEqual([]);
  });

  it("falls back to the seed list and warns when it's empty", async () => {
    const id = await newUser();
    const empty = (await getRecommendations(db, id, {}, { seed: () => ({ places: [], skipped: 0 }) }))!;
    expect(empty.results).toEqual([]);
    expect(empty.warnings.join(" ")).toMatch(/seed-restaurants.json is empty/);
    const seeded = (await getRecommendations(db, id, {}, { seed: () => ({ places: ALL_PLACES, skipped: 2 }) }))!;
    expect(seeded.results.length).toBeGreaterThan(0);
    expect(seeded.warnings).toContain("Skipped 2 seed restaurants with invalid data.");
  });
});

describe("loadSeedRestaurants", () => {
  it("keeps valid entries, drops extra fields, and counts invalid ones", () => {
    const raw = {
      places: [
        { id: "ok", category: "dinner", tags: ["thai"], pricePerPerson: 20, stationId: "place-coecl", city: "Boston", dietary: ["vegan"], hours: "11-22" },
        { id: "bad-price", category: "dinner", tags: [], pricePerPerson: -5, stationId: "x" },
        "not an object",
      ],
    };
    const { places, skipped } = loadSeedRestaurants(raw);
    expect(places.map((p) => p.id)).toEqual(["ok"]);
    expect(places[0]).not.toHaveProperty("hours");
    expect(skipped).toBe(2);
    expect(loadSeedRestaurants({})).toEqual({ places: [], skipped: 0 });
  });

  it("reads the real seed file without throwing", () => {
    expect(() => loadSeedRestaurants()).not.toThrow();
  });
});

describe("recommendationsRequestSchema", () => {
  it("accepts an empty body and rejects unknown fields or bad modes", () => {
    expect(recommendationsRequestSchema.safeParse({}).success).toBe(true);
    expect(recommendationsRequestSchema.safeParse({ mode: { kind: "destination", neighborhood: "Back Bay" }, limit: 10 }).success).toBe(true);
    expect(recommendationsRequestSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(recommendationsRequestSchema.safeParse({ mode: { kind: "teleport" } }).success).toBe(false);
    expect(recommendationsRequestSchema.safeParse({ limit: 500 }).success).toBe(false);
  });
});
