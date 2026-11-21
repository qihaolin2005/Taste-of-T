import { describe, expect, it } from "vitest";
import {
  buildSquadPlan,
  checkDietary,
  createSessionDeck,
  liveStandings,
  readSessionDeck,
  RECOMMENDER_CONFIG,
  sessionProgress,
  squadMemberContext,
  type GroupVote,
  type SessionMember,
} from "@/features/ml";
import { makeContext, syntheticCity } from "../recommend/__tests__/fixtures";

const PLACES = syntheticCity();
const m = (memberId: string, o: Parameters<typeof makeContext>[0] = {}): SessionMember => ({ memberId, ctx: makeContext({ location: null, ...o }, memberId), city: "Boston" });
const all = (deck: ReturnType<typeof createSessionDeck>, memberId: string, liked: (placeId: string, i: number) => boolean): GroupVote[] =>
  deck.items.map((it, i) => ({ memberId, placeId: it.place.id, liked: liked(it.place.id, i) }));

describe("squadMemberContext", () => {
  const form = { id: "m1", startStationId: "place-chncl", homeStationId: "place-harsq", budget: 30, tastes: ["ramen"], avoid: [], dietary: ["vegan"] };

  it("keeps the user's history and unions dietary and avoid with the join form", () => {
    const user = makeContext({ dietary: ["halal"], avoid: ["seafood"], tastes: ["pizza"], ratings: [{ placeId: "p1", score: 9 }] });
    const ctx = squadMemberContext(form, user);
    expect(ctx.history.ratings).toEqual([{ placeId: "p1", score: 9 }]);
    expect(ctx.preferences.dietary.sort()).toEqual(["halal", "vegan"]);
    expect(ctx.preferences.avoid).toEqual(["seafood"]);
    expect(ctx.preferences.tastes).toEqual(["ramen"]); // tonight's form wins
    expect(ctx.preferences.budgetPerPerson).toBe(30);
  });

  it("uses the join form alone for a member without a user", () => {
    expect(squadMemberContext(form, null).kind).toBe("member");
  });
});

describe("createSessionDeck", () => {
  it("shortlists 10 places that satisfy every member's restrictions, with backups", () => {
    const deck = createSessionDeck([m("a", { dietary: ["vegetarian"] }), m("b", { dietary: ["vegan"] }), m("c")], PLACES);
    expect(deck.items).toHaveLength(RECOMMENDER_CONFIG.session.deckSize);
    expect(deck.items.filter((i) => i.explore)).toHaveLength(RECOMMENDER_CONFIG.session.exploreSlots);
    expect(deck.memberIds).toEqual(["a", "b", "c"]);
    for (const c of [...deck.items, ...deck.backups]) expect(checkDietary(c.place, ["vegetarian", "vegan"]).ok).toBe(true);
    const ids = new Set(deck.items.map((i) => i.place.id));
    expect(deck.backups.some((b) => ids.has(b.place.id))).toBe(false);
  });

  it("round-trips through JSON (what Room.deck stores)", () => {
    const deck = createSessionDeck([m("a")], PLACES);
    expect(readSessionDeck(JSON.parse(JSON.stringify(deck)))).toEqual(deck);
    expect(readSessionDeck({ version: 99 })).toBeNull();
    expect(readSessionDeck(null)).toBeNull();
  });
});

describe("progress, live standings, final plan", () => {
  const deck = createSessionDeck([m("a"), m("b")], PLACES);
  const [p0, p1, p2] = deck.items.map((i) => i.place.id);

  it("tracks each member's progress and only finishes when everyone swiped all 10", () => {
    const votes = [...all(deck, "a", () => true), { memberId: "b", placeId: p0, liked: true }];
    const pr = sessionProgress(deck, votes);
    expect(pr.members).toEqual([
      { memberId: "a", swiped: 10, liked: 10, total: 10, done: true },
      { memberId: "b", swiped: 1, liked: 1, total: 10, done: false },
    ]);
    expect(pr.allDone).toBe(false);
    expect(sessionProgress(deck, [...votes, ...all(deck, "b", () => false)]).allDone).toBe(true);
  });

  it("ignores votes from people who joined after the start and for places not in the deck", () => {
    const pr = sessionProgress(deck, [{ memberId: "late", placeId: p0, liked: true }, { memberId: "a", placeId: "not-in-deck", liked: true }]);
    expect(pr.swiped).toBe(0);
  });

  it("live standings update as votes arrive", () => {
    expect(liveStandings(deck, [{ memberId: "a", placeId: p2, liked: true }]).picks[0].place.id).toBe(p2);
    const both = liveStandings(deck, [
      { memberId: "a", placeId: p2, liked: true },
      { memberId: "a", placeId: p1, liked: true },
      { memberId: "b", placeId: p1, liked: true },
    ]);
    expect(both.picks[0]).toMatchObject({ place: { id: p1 }, unanimous: true, reason: "everyone liked it (2/2)" });
  });

  it("final plan: top 5 with the #1 as the recommendation", () => {
    const liked = new Set([p0, p1, p2]);
    const votes = [...all(deck, "a", (id) => liked.has(id)), ...all(deck, "b", (id) => id === p1)];
    const plan = buildSquadPlan(deck, votes, { now: new Date("2026-11-21T23:00:00Z") });
    expect(plan.complete).toBe(true);
    expect(plan.picks).toHaveLength(5);
    expect(plan.recommended?.place.id).toBe(p1);
    expect(plan.picks.slice(0, 3).every((p) => p.status === "liked")).toBe(true);
    expect(plan.picks.slice(3).every((p) => p.status !== "liked")).toBe(true);
    expect(plan.picks[1].reason).toBe("1 of 2 liked it");
  });

  it("marks an early finish as incomplete", () => {
    const plan = buildSquadPlan(deck, [{ memberId: "a", placeId: p0, liked: true }]);
    expect(plan.complete).toBe(false);
    expect(plan.warnings[0]).toMatch(/Ended early: 1 of 20 swipes/);
  });
});

describe("participants who left", () => {
  const deck = createSessionDeck([m("a"), m("b"), m("c")], PLACES);
  const ids = deck.items.map((i) => i.place.id);
  const votes: GroupVote[] = [
    ...ids.map((placeId) => ({ memberId: "a", placeId, liked: placeId === ids[1] })),
    ...ids.map((placeId) => ({ memberId: "b", placeId, liked: placeId === ids[1] })),
    { memberId: "c", placeId: ids[0], liked: true },
  ];

  it("counts only people still in the squad toward finishing", () => {
    expect(sessionProgress(deck, votes).allDone).toBe(false); // c hasn't finished
    const pr = sessionProgress(deck, votes, ["a", "b"]);
    expect(pr).toMatchObject({ allDone: true, left: ["c"], swiped: 20, total: 20 });
    expect(pr.members.map((x) => x.memberId)).toEqual(["a", "b"]);
  });

  it("ignores a leaver's votes in the top 5, and late joiners never count", () => {
    const top = liveStandings(deck, votes, undefined, ["a", "b", "late"]).picks;
    expect(top[0]).toMatchObject({ place: { id: ids[1] }, unanimous: true, reason: "everyone liked it (2/2)" });
    expect(top.find((p) => p.place.id === ids[0])?.status).not.toBe("liked");
  });

  it("says in the plan that someone left", () => {
    const plan = buildSquadPlan(deck, votes, { active: ["a", "b"] });
    expect(plan.complete).toBe(true);
    expect(plan.warnings[0]).toBe("1 member left during swiping; their votes weren't counted.");
  });

  it("an empty squad is never 'done'", () => {
    expect(sessionProgress(deck, votes, []).allDone).toBe(false);
  });
});
