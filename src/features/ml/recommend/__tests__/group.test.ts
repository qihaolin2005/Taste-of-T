import { describe, expect, it } from "vitest";
import {
  areaOf,
  buildGroupDeck,
  checkDietary,
  cuisinesOf,
  groupVotesToSwipes,
  RECOMMENDER_CONFIG,
  rankAfterSwipes,
  recommendForUser,
  type GroupCandidate,
  type GroupDeck,
  type GroupMember,
  type GroupVote,
  type RestaurantCandidate,
} from "@/features/ml";
import { makeContext, makePlace, syntheticCity } from "./fixtures";

// ------------------------------------------------------------- a synthetic city

const PLACES = syntheticCity();
const member = (id: string, o: Parameters<typeof makeContext>[0] = {}, cityName = "Boston"): GroupMember => ({ id, ctx: makeContext({ location: null, ...o }, id), city: cityName });

// ------------------------------------------------------------- deck

describe("buildGroupDeck: filters", () => {
  it("uses places in the members' city area: Cambridge counts for a Boston squad, New York doesn't", () => {
    const r = buildGroupDeck([member("a"), member("b"), member("c", {}, "Cambridge")], PLACES);
    expect(r.city).toBe("Boston");
    expect(r.ranked.some((c) => c.place.id === "cam-thai")).toBe(true);
    expect(r.ranked.some((c) => c.place.id === "nyc-thai")).toBe(false);
    expect(r.counts.outOfCity).toBe(1);
    const cam = buildGroupDeck([member("a")], PLACES, { city: "CAMBRIDGE" });
    expect(cam.ranked.some((c) => c.place.city === "Boston")).toBe(true);
    expect(buildGroupDeck([member("a")], PLACES, { city: "new york" }).ranked.map((c) => c.place.id)).toEqual(["nyc-thai"]);
  });

  it("an unknown city only matches itself", () => {
    expect(areaOf("Somerville")).toBe("Greater Boston");
    expect(areaOf(" boston ")).toBe("Greater Boston");
    expect(areaOf("Springfield")).toBe("springfield");
  });

  it("only uses the kinds of place asked for", () => {
    const mixed = [...PLACES, makePlace("arcade", { category: "activity", cuisines: ["arcade"], city: "Boston" }), makePlace("boba", { category: "dessert", cuisines: ["boba"], city: "Boston", dietary: ["vegan"] })];
    const r = buildGroupDeck([member("a")], mixed, { categories: ["dessert"] });
    expect(r.ranked.map((c) => c.place.id)).toEqual(["boba"]);
    expect(r.counts.otherCategory).toBe(mixed.length - 1);
  });

  it("applies the UNION of members' restrictions: vegetarian + vegan -> every place is vegan-safe", () => {
    const r = buildGroupDeck([member("veg", { dietary: ["vegetarian"] }), member("vgn", { dietary: ["Vegan"] }), member("none")], PLACES);
    expect(r.dietary.sort()).toEqual(["vegan", "vegetarian"]);
    expect(r.deck.length).toBeGreaterThan(0);
    for (const c of r.ranked) {
      expect(checkDietary(c.place, ["vegetarian"]).ok).toBe(true);
      expect(checkDietary(c.place, ["vegan"]).ok).toBe(true);
    }
    expect(r.ranked.some((c) => c.place.dietStyle === "non-veg-only" || (c.place.dietStyle === "mixed" && c.place.dietary == null))).toBe(false);
  });

  it("returns an empty deck with a warning when nothing satisfies everyone", () => {
    const r = buildGroupDeck([member("a", { dietary: ["kosher"] })], PLACES);
    expect(r.deck).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/dietary/);
  });
});

describe("buildGroupDeck: scoring and deck", () => {
  it("group score = 0.6 * mean + 0.4 * min of member scores", () => {
    const r = buildGroupDeck([member("a", { ratings: [{ placeId: "thai-0", score: 10 }] }), member("b", { ratings: [{ placeId: "italian-0", score: 10 }] })], PLACES);
    for (const c of r.ranked) {
      const s = c.memberScores.map((m) => m.score);
      const expected = 0.6 * (s.reduce((x, y) => x + y) / s.length) + 0.4 * Math.min(...s);
      expect(c.groupScore).toBeCloseTo(expected, 3);
    }
  });

  it("builds a deck of ~18 distinct places with cuisine variety and a few explore picks", () => {
    const r = buildGroupDeck([member("a"), member("b"), member("c")], PLACES);
    expect(r.deck).toHaveLength(RECOMMENDER_CONFIG.group.deckSize);
    expect(new Set(r.deck.map((d) => d.place.id)).size).toBe(r.deck.length);
    expect(new Set(r.deck.flatMap((d) => cuisinesOf(d.place))).size).toBeGreaterThanOrEqual(8);
    expect(r.deck.filter((d) => d.explore)).toHaveLength(RECOMMENDER_CONFIG.group.exploreSlots);
    expect(r.deck[r.deck.length - 1].explore).toBe(false); // spread through the deck, not piled at the end
    expect(r.deck.every((d) => d.reason.length > 0)).toBe(true);
  });

  it("vetoes places one member would hate, even if the others love them", () => {
    const thaiIds = PLACES.filter((p) => p.cuisines?.[0] === "thai").map((p) => p.id);
    const lovers = (id: string) => member(id, { ratings: thaiIds.slice(0, 3).map((placeId) => ({ placeId, score: 10 })) });
    const hater = member("hater", {
      ratings: [
        { placeId: "thai-0", score: 0 },
        { placeId: "thai-1", score: 0 },
        { placeId: "italian-1", score: 9 },
        { placeId: "mexican-1", score: 9 },
      ],
    });
    const r = buildGroupDeck([lovers("a"), lovers("b"), hater], PLACES);
    expect(r.vetoDropped).toBe(false);
    expect(r.counts.vetoed).toBeGreaterThan(0);
    expect(r.ranked.some((c) => cuisinesOf(c.place).includes("thai"))).toBe(false);
    const thai0 = buildGroupDeck([lovers("a"), hater], PLACES.filter((p) => p.id === "thai-0" || p.id === "thai-3"), { catalog: PLACES });
    expect(thai0.vetoDropped).toBe(true); // only 2 places, so the veto is off, but the reasons are recorded
    const reasons = Object.fromEntries(thai0.ranked.map((c) => [c.place.id, c.memberScores.find((m) => m.memberId === "hater")!.hates]));
    expect(reasons).toEqual({ "thai-0": "disliked", "thai-3": "taste" });
  });

  it("does not veto on taste with too little evidence", () => {
    const unsure = member("unsure", { ratings: [{ placeId: "thai-0", score: 3 }] }); // one mild dislike
    const r = buildGroupDeck([member("a"), unsure], PLACES);
    expect(r.ranked.some((c) => c.place.id === "thai-3")).toBe(true);
  });

  it("treats a member's avoid tag as a veto", () => {
    const r = buildGroupDeck([member("a"), member("b", { avoid: ["korean"] })], PLACES);
    expect(r.ranked.some((c) => cuisinesOf(c.place).includes("korean"))).toBe(false);
  });

  it("drops the veto, and says so, when it would leave fewer than 5 places", () => {
    const few = PLACES.filter((p) => ["thai-0", "thai-1", "thai-4", "italian-0", "mexican-0", "chinese-0"].includes(p.id));
    const r = buildGroupDeck([member("a"), member("b", { avoid: ["thai"] })], few);
    expect(r.vetoDropped).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/veto would have left only 3 places/);
    expect(r.ranked.some((c) => c.vetoed)).toBe(true);
    // the places someone would hate rank last
    expect(r.ranked.slice(-3).every((c) => c.vetoed)).toBe(true);
  });
});

// ------------------------------------------------------------- ranking after swipes

const cand = (id: string, groupScore: number, rating = 4): GroupCandidate => ({
  place: makePlace(id, { rating, cuisines: ["thai"] }),
  groupScore,
  mean: groupScore,
  min: groupScore,
  memberScores: [],
  uncertainty: 0,
  vetoed: false,
});
const deckOf = (cands: GroupCandidate[], extraRanked: GroupCandidate[] = []): Pick<GroupDeck, "deck" | "ranked"> => ({
  deck: cands.map((c) => ({ ...c, explore: false, reason: "" })),
  ranked: [...cands, ...extraRanked].sort((a, b) => b.groupScore - a.groupScore),
});
const vote = (memberId: string, placeId: string, liked: boolean, at?: number): GroupVote => ({ memberId, placeId, liked, at });
const MEMBERS = ["a", "b", "c"];
const ids = (r: { picks: { place: RestaurantCandidate }[] }) => r.picks.map((p) => p.place.id);

describe("rankAfterSwipes", () => {
  it("ranks by like ratio among members who swiped", () => {
    const deck = deckOf([cand("p1", 0.9), cand("p2", 0.5), cand("p3", 0.7)]);
    const votes = [vote("a", "p1", true), vote("b", "p1", false), vote("c", "p1", false), vote("a", "p2", true), vote("b", "p2", true), vote("c", "p2", false), vote("a", "p3", false)];
    const r = rankAfterSwipes(deck, votes, MEMBERS);
    expect(ids(r).slice(0, 2)).toEqual(["p2", "p1"]); // 2/3 beats 1/3 despite a lower group score
    expect(r.picks[0]).toMatchObject({ likes: 2, dislikes: 1, swiped: 3, likeRatio: 0.6667, status: "liked" });
  });

  it("boosts unanimous likes over a perfect ratio from members who didn't all swipe", () => {
    const deck = deckOf([cand("partial", 0.95), cand("everyone", 0.4)]);
    const votes = [vote("a", "partial", true), vote("b", "partial", true), ...MEMBERS.map((m) => vote(m, "everyone", true))];
    const r = rankAfterSwipes(deck, votes, MEMBERS);
    expect(ids(r).slice(0, 2)).toEqual(["everyone", "partial"]);
    expect(r.picks[0].unanimous).toBe(true);
    expect(r.picks[1]).toMatchObject({ unanimous: false, likeRatio: 1, swiped: 2 });
  });

  it("members who didn't finish swiping don't count against a place", () => {
    const deck = deckOf([cand("p1", 0.5), cand("p2", 0.6)]);
    // c never swiped; b only swiped p1
    const votes = [vote("a", "p1", true), vote("b", "p1", true), vote("a", "p2", true), vote("b", "p2", false)];
    const r = rankAfterSwipes(deck, votes, MEMBERS);
    expect(r.picks[0]).toMatchObject({ place: { id: "p1" }, likeRatio: 1, swiped: 2, unanimous: false });
    expect(r.picks[1]).toMatchObject({ place: { id: "p2" }, likeRatio: 0.5 });
  });

  it("breaks ties by pre-swipe group score, then rating, then id", () => {
    const deck = deckOf([cand("low", 0.3, 4.9), cand("high", 0.8, 3.0), cand("same-a", 0.5, 4.0), cand("same-b", 0.5, 4.5), cand("same-c", 0.5, 4.5)]);
    const votes = ["low", "high", "same-a", "same-b", "same-c"].map((p) => vote("a", p, true));
    const r = rankAfterSwipes(deck, votes, MEMBERS);
    expect(ids(r)).toEqual(["high", "same-b", "same-c", "same-a", "low"]);
  });

  it("fills up to 5 from top group scores when fewer got likes, marked not voted", () => {
    const deck = deckOf([cand("liked", 0.2), cand("disliked", 0.99), cand("unseen1", 0.6), cand("unseen2", 0.7)], [cand("off-deck", 0.65)]);
    const votes = [vote("a", "liked", true), vote("a", "disliked", false), vote("b", "disliked", false)];
    const r = rankAfterSwipes(deck, votes, MEMBERS);
    expect(r.picks.map((p) => [p.place.id, p.status])).toEqual([
      ["liked", "liked"],
      ["unseen2", "not-voted"],
      ["off-deck", "not-voted"],
      ["unseen1", "not-voted"],
      ["disliked", "no-likes"], // only once nothing unvoted is left
    ]);
    expect(r.filled).toBe(4);
    expect(r.picks.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(r.warnings.join(" ")).toMatch(/Only 1 place got a like/);
  });

  it("returns 5 liked places with no filler when enough got likes", () => {
    const deck = deckOf(["a", "b", "c", "d", "e", "f"].map((id, i) => cand(id, 0.5 + i / 100)));
    const r = rankAfterSwipes(deck, ["a", "b", "c", "d", "e", "f"].map((p) => vote("a", p, true)), MEMBERS);
    expect(r.picks).toHaveLength(5);
    expect(r.filled).toBe(0);
    expect(r.picks.every((p) => p.status === "liked")).toBe(true);
  });

  it("uses each member's latest vote and ignores votes from outsiders or for places not in the deck", () => {
    const deck = deckOf([cand("p1", 0.5)]);
    const votes = [vote("a", "p1", false, 1), vote("a", "p1", true, 2), vote("zed", "p1", true), vote("a", "ghost", true)];
    const r = rankAfterSwipes(deck, votes, MEMBERS);
    expect(r.picks[0]).toMatchObject({ likes: 1, dislikes: 0, swiped: 1 });
    expect(r.warnings.join(" ")).toMatch(/Ignored 2 votes/);
  });

  it("handles an empty deck", () => {
    expect(rankAfterSwipes({ deck: [], ranked: [] }, [], MEMBERS)).toEqual({ picks: [], filled: 0, warnings: [] });
  });
});

describe("group swipes feed individual recommendations", () => {
  it("turns a member's group votes into swipes that teach their individual profile", () => {
    const votes = [vote("a", "thai-0", true), vote("a", "thai-1", true), vote("a", "italian-1", false), vote("b", "mexican-0", true)];
    const swipes = groupVotesToSwipes(votes, "session-1");
    expect(swipes.get("a")).toHaveLength(3);
    expect(swipes.get("a")!.every((s) => s.source === "group" && s.sessionId === "session-1")).toBe(true);

    const ctx = makeContext({ location: { lat: 42.35, lng: -71.06 } }, "a");
    const before = recommendForUser(ctx, PLACES, { limit: 50 });
    const after = recommendForUser(ctx, PLACES, { limit: 50, swipes: swipes.get("a") });
    expect(before.confidence).toBe(0);
    expect(after.confidence).toBeGreaterThan(0);
    const sim = (r: typeof after, id: string) => r.results.find((x) => x.place.id === id)?.components.similarity ?? NaN;
    expect(sim(after, "thai-4")).toBeGreaterThan(sim(after, "italian-4"));
  });
});
