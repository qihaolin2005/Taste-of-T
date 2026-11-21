import { describe, expect, it } from "vitest";
import {
  blendWeights,
  checkDietary,
  confidenceFrom,
  deriveInteractions,
  groupSwipesToHistory,
  mmrRerank,
  RECOMMENDER_CONFIG,
  recommendForUser,
  type RestaurantCandidate,
} from "@/features/ml";
import { ALL_PLACES, COPLEY, makeContext, makePlace } from "./fixtures";

const ids = (r: { results: { place: RestaurantCandidate }[] }) => r.results.map((x) => x.place.id);

describe("deriveInteractions", () => {
  it("maps ratings to signed weights, ignores neutral ones, and weights recent items higher", () => {
    const ctx = makeContext({ ratings: [{ placeId: "new", score: 10 }, { placeId: "mid", score: 5 }, { placeId: "old", score: 10 }, { placeId: "bad", score: 1 }] });
    const w = Object.fromEntries(deriveInteractions(ctx).map((i) => [i.placeId, i.weight]));
    expect(w.mid).toBeUndefined();
    expect(w.new).toBeGreaterThan(w.old);
    expect(w.bad).toBeLessThan(0);
  });

  it("treats wishlist and check-ins as capped weak likes that a rating overrides", () => {
    const ctx = makeContext({ wishlist: ["a", "b"], checkIns: ["a", "b"], ratings: [{ placeId: "b", score: 2 }] });
    const w = Object.fromEntries(deriveInteractions(ctx).map((i) => [i.placeId, i.weight]));
    expect(w.a).toBeGreaterThan(0);
    expect(w.a).toBeLessThanOrEqual(RECOMMENDER_CONFIG.signals.weakCap);
    expect(w.b).toBeLessThan(0);
  });

  it("counts group swipes at a reduced weight", () => {
    const ctx = makeContext();
    const solo = deriveInteractions(ctx, [{ placeId: "x", liked: true, source: "solo" }])[0].weight;
    const group = deriveInteractions(ctx, groupSwipesToHistory([{ placeId: "x", liked: true }], "s1"))[0].weight;
    expect(group).toBeCloseTo(solo * RECOMMENDER_CONFIG.signals.groupSwipeFactor);
  });

  it("orders swipes by timestamp when given", () => {
    const ctx = makeContext();
    const w = Object.fromEntries(
      deriveInteractions(ctx, [
        { placeId: "old", liked: true, source: "solo", at: 1 },
        { placeId: "new", liked: true, source: "solo", at: 2 },
      ]).map((i) => [i.placeId, i.weight]),
    );
    expect(w.new).toBeGreaterThan(w.old);
  });
});

describe("blend weights and cold start", () => {
  it("puts no weight on similarity with zero evidence and shifts toward it as evidence grows", () => {
    expect(blendWeights(0, true).similarity).toBe(0);
    const w = blendWeights(confidenceFrom(20), true);
    expect(w.similarity + w.quality + w.distance).toBeCloseTo(1);
    expect(confidenceFrom(1)).toBeLessThan(confidenceFrom(5));
    expect(blendWeights(1, true).similarity).toBeCloseTo(RECOMMENDER_CONFIG.blend.similarity);
    expect(blendWeights(0.5, false).distance).toBe(0);
  });
});

describe("recommendForUser: candidates", () => {
  it("nearby: only places within the radius of the user's location", () => {
    const r = recommendForUser(makeContext(), ALL_PLACES, { limit: 50 });
    expect(ids(r)).not.toContain("farThai");
    expect(r.origin?.source).toBe("location");
    expect(r.results.every((x) => x.distanceMiles! <= 5)).toBe(true);
  });

  it("nearby: a smaller radius drops Cambridge", () => {
    const r = recommendForUser(makeContext(), ALL_PLACES, { mode: { kind: "nearby", radiusMiles: 1.5 }, limit: 50 });
    expect(ids(r).some((id) => id.startsWith("hs"))).toBe(false);
    expect(ids(r).some((id) => id.startsWith("ct"))).toBe(true);
  });

  it("nearby: falls back to the start station when location isn't shared, and warns with no origin at all", () => {
    expect(recommendForUser(makeContext({ location: null, start: "place-harsq" }), ALL_PLACES).origin?.source).toBe("start-station");
    const none = recommendForUser(makeContext({ location: null }), ALL_PLACES);
    expect(none.results).toEqual([]);
    expect(none.warnings[0]).toMatch(/can't search nearby/);
  });

  it("destination: places in the neighborhood, scored by distance from it, not from the user", () => {
    const r = recommendForUser(makeContext(), ALL_PLACES, { mode: { kind: "destination", neighborhood: "harvard square" }, limit: 50 });
    expect(ids(r).sort()).toEqual(["hsIndian", "hsRamen", "hsThai"]);
    expect(r.origin?.source).toBe("destination");
    expect(r.results[0].reasons).toContain("in Harvard Square");
  });

  it("destination: includes untagged places near the center", () => {
    const nearby = makePlace("untagged", { lat: 42.3731, lng: -71.1189, neighborhood: undefined, cuisines: ["cafe"], dietary: ["vegetarian"] });
    const r = recommendForUser(makeContext(), [...ALL_PLACES, nearby], { mode: { kind: "destination", neighborhood: "Harvard Square" }, limit: 50 });
    expect(ids(r)).toContain("untagged");
  });
});

describe("recommendForUser: hard filters", () => {
  it("never returns a place that fails the user's dietary restrictions", () => {
    for (const dietary of [["vegetarian"], ["vegan"], ["halal"], ["vegan", "halal"]]) {
      const ctx = makeContext({ dietary });
      const r = recommendForUser(ctx, ALL_PLACES, { limit: 50 });
      for (const x of r.results) expect(checkDietary(x.place, dietary).ok).toBe(true);
    }
  });

  it("dietary beats taste: a vegan who loves steak still never gets the non-veg-only steakhouse", () => {
    const ctx = makeContext({ dietary: ["vegan"], ratings: [{ placeId: "bbSteak", score: 10 }] });
    const r = recommendForUser(ctx, ALL_PLACES, { limit: 50 });
    expect(ids(r)).not.toContain("bbSteak");
    expect(ids(r)).not.toContain("ctNoodle"); // unknown dietary info
    expect(r.counts.dietary).toBeGreaterThan(0);
  });

  it("drops avoided tags and places the user rated badly", () => {
    const r = recommendForUser(makeContext({ avoid: ["spicy"], ratings: [{ placeId: "bbItalian", score: 1 }] }), ALL_PLACES, { limit: 50 });
    expect(ids(r)).not.toContain("ctThai");
    expect(ids(r)).not.toContain("hsIndian");
    expect(ids(r)).not.toContain("bbItalian");
    expect(r.counts.avoided).toBe(2);
    expect(r.counts.disliked).toBe(1);
  });
});

describe("recommendForUser: scoring", () => {
  it("cold start ranks by rating quality and distance only", () => {
    const r = recommendForUser(makeContext(), ALL_PLACES, { limit: 50 });
    expect(r.confidence).toBe(0);
    for (const x of r.results) expect(x.components.similarity).toBe(0.5);
    // Back Bay steakhouse: best Bayesian rating and right next to Copley
    expect(r.results[0].place.id).toBe("bbSteak");
  });

  it("learns from ratings: a thai lover sees thai places ranked up", () => {
    const cold = recommendForUser(makeContext(), ALL_PLACES, { limit: 50 });
    const ctx = makeContext({ ratings: [{ placeId: "bbThai", score: 10 }, { placeId: "hsThai", score: 9 }, { placeId: "bbItalian", score: 2 }] });
    const warm = recommendForUser(ctx, ALL_PLACES, { limit: 50 });
    const rank = (r: typeof cold, id: string) => ids(r).indexOf(id);
    expect(warm.confidence).toBeGreaterThan(0);
    expect(rank(warm, "ctThai")).toBeLessThan(rank(cold, "ctThai"));
    const ctThai = warm.results.find((x) => x.place.id === "ctThai")!;
    expect(ctThai.reasons).toContain("you liked other thai places");
  });

  it("learns from places outside the search area via the catalog", () => {
    const ctx = makeContext({ ratings: [{ placeId: "farThai", score: 10 }] });
    const r = recommendForUser(ctx, ALL_PLACES, { limit: 50 });
    expect(r.confidence).toBeGreaterThan(0);
    const thai = r.results.find((x) => x.place.id === "bbThai")!;
    const italian = r.results.find((x) => x.place.id === "bbItalian")!;
    expect(thai.components.similarity).toBeGreaterThan(italian.components.similarity);
  });

  it("is deterministic", () => {
    const ctx = makeContext({ ratings: [{ placeId: "bbThai", score: 9 }] });
    expect(recommendForUser(ctx, ALL_PLACES)).toEqual(recommendForUser(ctx, ALL_PLACES));
  });
});

describe("diversity and reasons", () => {
  it("MMR keeps one cuisine from taking over the list", () => {
    const thai = Array.from({ length: 8 }, (_, i) => makePlace(`thai${i}`, { lat: COPLEY.lat, lng: COPLEY.lng, cuisines: ["thai"], rating: 4.8, reviewCount: 1000, dietary: ["vegetarian"] }));
    const others = ["mexican", "italian", "korean"].map((c) => makePlace(c, { lat: COPLEY.lat, lng: COPLEY.lng, cuisines: [c], rating: 4.3, reviewCount: 500, dietary: ["vegetarian"] }));
    const items = [...thai, ...others].map((place, i) => ({ place, score: place.cuisines![0] === "thai" ? 0.9 - i * 0.001 : 0.7 }));
    const top5 = mmrRerank(items, 5, RECOMMENDER_CONFIG.mmr.lambda).map((x) => x.place.cuisines![0]);
    expect(new Set(top5).size).toBeGreaterThanOrEqual(3);
    expect(top5[0]).toBe("thai"); // still leads with the best match
    expect(mmrRerank(items, 5, 1).every((x) => x.place.cuisines![0] === "thai")).toBe(true); // lambda 1 = pure score
  });

  it("gives a short reason with distance, rating and dietary info", () => {
    const ctx = makeContext({ dietary: ["vegan"], wishlist: ["bbThai"] });
    const r = recommendForUser(ctx, ALL_PLACES, { limit: 50 });
    const thai = r.results.find((x) => x.place.id === "bbThai")!;
    expect(thai.reason).toMatch(/^on your wishlist, .*0\.\d mi away, 4\.5★ from 800 reviews, has vegan options$/);
  });
});
