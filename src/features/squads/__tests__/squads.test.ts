import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { getOrCreateUser, updatePreferences } from "@/features/users";
import { recommendForUser, buildUserContext } from "@/features/ml";
import { makePlace, syntheticCity } from "@/features/ml/recommend/__tests__/fixtures";
import {
  completeRoom,
  endAdventure,
  getLiveState,
  loadUserSwipes,
  recordSoloSwipe,
  SquadSessionError,
  startAdventure,
  submitSwipe,
} from "@/features/squads";

const db = createTestDb();
afterAll(() => db.$disconnect());

const PLACES = syntheticCity();
let roomSeq = 0;

async function newUser(prefs: Parameters<typeof updatePreferences>[2] = {}) {
  const { user } = await getOrCreateUser(db, null); // anonymous guest
  await updatePreferences(db, user.id, { city: "Boston", ...prefs });
  return user.id;
}

/** A squad: the first user is the host. */
async function squad(n = 3, prefs: Parameters<typeof updatePreferences>[2][] = []) {
  const users = await Promise.all(Array.from({ length: n }, (_, i) => newUser(prefs[i])));
  const id = `room${++roomSeq}`;
  await db.room.create({ data: { id, name: "Friday", hostUserId: users[0], date: "2026-11-27", startTime: 1080, slots: ["dinner"] } });
  const members = [];
  for (const [i, userId] of users.entries())
    members.push(
      await db.roomMember.create({
        data: { roomId: id, userId, name: `M${i}`, startStationId: "place-pktrm", homeStationId: "place-harsq", budget: 40, dietary: prefs[i]?.dietary ?? [] },
      }),
    );
  return { id, users, host: users[0], members };
}

const expectError = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(SquadSessionError);
  await expect(p).rejects.toMatchObject({ code });
};

describe("startAdventure", () => {
  it("lets only the host start, saves a shortlist of 10, and can't start twice", async () => {
    const s = await squad(3, [{}, { dietary: ["vegetarian"] }, { dietary: ["vegan"] }]);
    await expectError(startAdventure(db, s.id, s.users[1], { places: PLACES }), "forbidden");
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    expect(deck.items).toHaveLength(10);
    expect(deck.dietary.sort()).toEqual(["vegan", "vegetarian"]);
    expect(deck.city).toBe("Boston");
    const room = await db.room.findUnique({ where: { id: s.id } });
    expect(room).toMatchObject({ status: "swiping" });
    expect(room!.startedAt).not.toBeNull();
    await expectError(startAdventure(db, s.id, s.host, { places: PLACES }), "conflict");
  });

  it("works for a guest host (anonymous user)", async () => {
    const s = await squad(1);
    await expect(startAdventure(db, s.id, s.host, { places: PLACES })).resolves.toBeTruthy();
  });

  it("leaves the room unstarted when nothing fits", async () => {
    const s = await squad(2, [{ dietary: ["kosher"] }]);
    await expectError(startAdventure(db, s.id, s.host, { places: PLACES }), "bad_request");
    expect((await db.room.findUnique({ where: { id: s.id } }))!.status).toBe("collecting");
  });

  it("uses members' past history: someone who hated thai doesn't get thai in the deck", async () => {
    const s = await squad(2);
    await db.rating.createMany({
      data: [
        { userId: s.users[1], placeId: "thai-0", score: 0 },
        { userId: s.users[1], placeId: "thai-1", score: 0 },
        { userId: s.users[1], placeId: "italian-1", score: 9 },
      ],
    });
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    expect(deck.items.some((i) => i.place.cuisines?.includes("thai"))).toBe(false);
  });
});

describe("swiping and live state", () => {
  it("rejects swipes before start, from outsiders, and for places not in the deck", async () => {
    const s = await squad(2);
    await expectError(submitSwipe(db, s.id, s.host, "thai-0", true), "conflict");
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    const outsider = await newUser();
    await expectError(submitSwipe(db, s.id, outsider, deck.items[0].place.id, true), "forbidden");
    await expectError(submitSwipe(db, s.id, s.host, "not-in-deck", true), "bad_request");
  });

  it("tracks votes live, lets members change a vote, and finishes when everyone has swiped all 10", async () => {
    const s = await squad(2);
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    const ids = deck.items.map((i) => i.place.id);

    await submitSwipe(db, s.id, s.users[1], ids[3], false);
    await submitSwipe(db, s.id, s.users[1], ids[3], true); // changed their mind
    let live = await getLiveState(db, s.id, s.users[1]);
    expect(live.status).toBe("swiping");
    expect(live.deck).toHaveLength(10);
    expect(live.mySwipes).toEqual({ [ids[3]]: true });
    expect(live.progress.map((p) => [p.name, p.swiped])).toEqual([["M0", 0], ["M1", 1]]);
    expect(live.standings[0]).toMatchObject({ placeId: ids[3], likes: 1, status: "liked" });
    expect(await db.swipe.count({ where: { roomId: s.id } })).toBe(1);

    const v1 = live.version;
    for (const id of ids) {
      const r = await submitSwipe(db, s.id, s.host, id, id === ids[3] || id === ids[5]);
      expect(r.finished).toBe(false); // member 1 isn't done
    }
    expect((await getLiveState(db, s.id, s.host)).version).not.toBe(v1);

    let last;
    for (const id of ids.filter((x) => x !== ids[3])) last = await submitSwipe(db, s.id, s.users[1], id, id === ids[5]);
    expect(last!.finished).toBe(true);
    expect(last!.plan!.picks).toHaveLength(5);
    // Both members liked ids[3] and ids[5] (both unanimous), so the tie goes to the pre-swipe group score.
    const [first, second] = [ids[3], ids[5]].map((id) => deck.items.find((i) => i.place.id === id)!).sort((x, y) => y.groupScore - x.groupScore);
    expect(last!.plan!.picks.slice(0, 2).map((p) => p.place.id)).toEqual([first.place.id, second.place.id]);
    expect(last!.plan!.recommended!.place.id).toBe(first.place.id);

    live = await getLiveState(db, s.id, s.host);
    expect(live.status).toBe("planned");
    expect(live.isHost).toBe(true);
    expect(live.plan?.complete).toBe(true);
    expect(await db.plan.count({ where: { roomId: s.id } })).toBe(1);
    await expectError(submitSwipe(db, s.id, s.host, ids[0], true), "conflict");
  });

  it("someone who joined after the start can't swipe and doesn't block finishing", async () => {
    const s = await squad(1);
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    const late = await newUser();
    await db.roomMember.create({ data: { roomId: s.id, userId: late, name: "Late", startStationId: "place-pktrm", homeStationId: "place-pktrm", budget: 20 } });
    await expectError(submitSwipe(db, s.id, late, deck.items[0].place.id, true), "forbidden");
    let r;
    for (const it of deck.items) r = await submitSwipe(db, s.id, s.host, it.place.id, true);
    expect(r!.finished).toBe(true);
  });

  it("only the host can end early, and the plan says it's incomplete", async () => {
    const s = await squad(2);
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    await submitSwipe(db, s.id, s.users[1], deck.items[2].place.id, true);
    await expectError(endAdventure(db, s.id, s.users[1]), "forbidden");
    const plan = await endAdventure(db, s.id, s.host);
    expect(plan.complete).toBe(false);
    expect(plan.recommended!.place.id).toBe(deck.items[2].place.id);
    await expectError(endAdventure(db, s.id, s.host), "conflict");
  });

  it("finishing twice at the same moment creates one plan", async () => {
    const s = await squad(1);
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    const { buildSquadPlan } = await import("@/features/ml");
    const plan = buildSquadPlan(deck, []);
    await Promise.all([completeRoom(db, s.id, plan, {}, s.host), completeRoom(db, s.id, plan, {}, s.host)]);
    expect(await db.plan.count({ where: { roomId: s.id } })).toBe(1);
  });

  it("live state before start shows members and no deck", async () => {
    const s = await squad(2);
    const live = await getLiveState(db, s.id, null);
    expect(live).toMatchObject({ status: "collecting", deck: null, isHost: false, myMemberId: null, standings: [] });
    expect(live.progress).toHaveLength(2);
    await expectError(getLiveState(db, "nope", null), "not_found");
  });
});

describe("swipe history", () => {
  it("group swipes become the user's history and shape their individual recommendations", async () => {
    const s = await squad(1);
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    for (const it of deck.items) await submitSwipe(db, s.id, s.host, it.place.id, it.place.cuisines?.[0] === deck.items[0].place.cuisines?.[0]);
    const swipes = await loadUserSwipes(db, s.host);
    expect(swipes).toHaveLength(10);
    expect(swipes.every((x) => x.source === "group" && x.sessionId === s.id)).toBe(true);

    const ctx = (await buildUserContext(db, s.host))!;
    const cold = recommendForUser(ctx, PLACES, { origin: { lat: 42.35, lng: -71.06 } });
    const warm = recommendForUser(ctx, PLACES, { origin: { lat: 42.35, lng: -71.06 }, swipes });
    expect(cold.confidence).toBe(0);
    expect(warm.confidence).toBeGreaterThan(0);
  });

  it("solo swipes are stored once per place and updated on re-swipe", async () => {
    const u = await newUser();
    await recordSoloSwipe(db, u, "thai-0", true);
    await recordSoloSwipe(db, u, "thai-0", false);
    await recordSoloSwipe(db, u, "italian-0", true);
    const swipes = await loadUserSwipes(db, u);
    expect(swipes.map((x) => [x.placeId, x.liked, x.source])).toEqual([
      ["italian-0", true, "solo"],
      ["thai-0", false, "solo"],
    ]);
  });
});

describe("members leaving mid-session", () => {
  // Mirrors leaveRoom() in src/features/rooms: the member row is deleted.
  const leave = (roomId: string, userId: string) => db.roomMember.deleteMany({ where: { roomId, userId } });
  const swipeAll = async (roomId: string, userId: string, ids: string[], liked: (id: string) => boolean) => {
    let last;
    for (const id of ids) last = await submitSwipe(db, roomId, userId, id, liked(id));
    return last!;
  };

  it("a leaver doesn't block finishing, their votes stop counting, and their swipes stay in their history", async () => {
    const s = await squad(3);
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    const ids = deck.items.map((i) => i.place.id);

    for (const id of ids.slice(0, 4)) await submitSwipe(db, s.id, s.users[2], id, true);
    await leave(s.id, s.users[2]);

    await swipeAll(s.id, s.host, ids, (id) => id === ids[5]);
    const r = await swipeAll(s.id, s.users[1], ids, (id) => id === ids[5]);
    expect(r.finished).toBe(true);
    expect(r.plan!.complete).toBe(true);
    expect(r.plan!.recommended!.place.id).toBe(ids[5]);
    expect(r.plan!.recommended!.unanimous).toBe(true); // 2 of 2 remaining members
    expect(r.plan!.picks.filter((p) => p.status === "liked").map((p) => p.place.id)).toEqual([ids[5]]); // leaver's likes don't count
    expect(r.plan!.warnings[0]).toMatch(/1 member left during swiping/);

    const history = await loadUserSwipes(db, s.users[2]);
    expect(history).toHaveLength(4);
    expect(await db.swipe.count({ where: { userId: s.users[2], roomId: s.id, memberId: null } })).toBe(4);
  });

  it("finishes on the next poll when the last unfinished member leaves, even if it's the host", async () => {
    const s = await squad(3);
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    const ids = deck.items.map((i) => i.place.id);
    await swipeAll(s.id, s.users[1], ids, () => true);
    await swipeAll(s.id, s.users[2], ids, (id) => id !== ids[0]);
    for (const id of ids.slice(0, 3)) await submitSwipe(db, s.id, s.host, id, false);
    expect((await getLiveState(db, s.id, s.users[1])).status).toBe("swiping");

    await leave(s.id, s.host);
    const live = await getLiveState(db, s.id, s.users[1]);
    expect(live.status).toBe("planned");
    expect(live.plan?.complete).toBe(true);
    expect(live.leftCount).toBe(1);
    expect(live.progress).toHaveLength(2);
    expect(await db.plan.count({ where: { roomId: s.id } })).toBe(1);
    await getLiveState(db, s.id, s.users[2]); // polling again doesn't make a second plan
    expect(await db.plan.count({ where: { roomId: s.id } })).toBe(1);
  });

  it("someone who leaves and rejoins carries on with their earlier swipes, without duplicates", async () => {
    const s = await squad(2);
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    const ids = deck.items.map((i) => i.place.id);
    for (const id of ids.slice(0, 3)) await submitSwipe(db, s.id, s.users[1], id, true);

    await leave(s.id, s.users[1]);
    let live = await getLiveState(db, s.id, s.host);
    expect(live.progress).toHaveLength(1);
    expect(live.leftCount).toBe(1);

    await db.roomMember.create({ data: { roomId: s.id, userId: s.users[1], name: "M1 again", startStationId: "place-pktrm", homeStationId: "place-harsq", budget: 40 } });
    await submitSwipe(db, s.id, s.users[1], ids[0], false); // changes an earlier vote
    await submitSwipe(db, s.id, s.users[1], ids[3], true); // and continues
    live = await getLiveState(db, s.id, s.users[1]);
    expect(live.leftCount).toBe(0);
    expect(live.progress.find((p) => p.name === "M1 again")).toMatchObject({ swiped: 4 });
    expect(live.mySwipes).toEqual({ [ids[0]]: false, [ids[1]]: true, [ids[2]]: true, [ids[3]]: true });
    expect(await db.swipe.count({ where: { roomId: s.id, userId: s.users[1] } })).toBe(4);
  });

  it("if everyone leaves, the session stays open and live state still works", async () => {
    const s = await squad(2);
    await startAdventure(db, s.id, s.host, { places: PLACES });
    await leave(s.id, s.host);
    await leave(s.id, s.users[1]);
    const live = await getLiveState(db, s.id, null);
    expect(live).toMatchObject({ status: "swiping", progress: [], leftCount: 2, plan: null });
  });

  it("never exposes raw user ids to other squad members", async () => {
    const s = await squad(2);
    const deck = await startAdventure(db, s.id, s.host, { places: PLACES });
    const ids = deck.items.map((i) => i.place.id);
    await swipeAll(s.id, s.host, ids, () => true);
    await swipeAll(s.id, s.users[1], ids, () => false);
    const json = JSON.stringify(await getLiveState(db, s.id, s.users[1]));
    for (const u of s.users) expect(json).not.toContain(u);
  });
});

describe("the shortlist follows the night's stops", () => {
  const DESSERTS = ["boba", "gelato", "bakery"].map((c, i) =>
    makePlace(`dessert-${c}`, { category: "dessert", cuisines: [c === "gelato" ? "ice-cream" : c], city: "Somerville", rating: 4.5, reviewCount: 300 + i, dietStyle: "mixed", dietary: ["vegetarian", "vegan"] }),
  );
  const ACTIVITY = makePlace("karaoke", { category: "activity", cuisines: ["karaoke"], city: "Boston", rating: 4.8, reviewCount: 900 });
  const MIXED = [...PLACES, ...DESSERTS, ACTIVITY];

  async function roomWithStops(slots: string[]) {
    const s = await squad(2, [{}, { dietary: ["vegan"] }]);
    await db.room.update({ where: { id: s.id }, data: { slots } });
    return s;
  }

  it("a dinner night (the default) swipes on dinner places only", async () => {
    const s = await roomWithStops(["dinner", "dessert", "activity"]);
    const deck = await startAdventure(db, s.id, s.host, { places: MIXED });
    expect(deck.category).toBe("dinner");
    expect(deck.items.every((i) => i.place.category === "dinner")).toBe(true);
    expect((await getLiveState(db, s.id, s.host)).category).toBe("dinner");
  });

  it("a dessert-or-boba night swipes on dessert spots, including Somerville ones for a Boston squad", async () => {
    const s = await roomWithStops(["dessert"]);
    const deck = await startAdventure(db, s.id, s.host, { places: MIXED });
    expect(deck.category).toBe("dessert");
    expect(deck.items.map((i) => i.place.id).sort()).toEqual(DESSERTS.map((d) => d.id).sort());
  });

  it("an activity-only night swipes on activities, which skip the dietary filter", async () => {
    const s = await roomWithStops(["activity"]);
    const deck = await startAdventure(db, s.id, s.host, { places: MIXED });
    expect(deck.items.map((i) => i.place.id)).toEqual(["karaoke"]); // vegan member, no dietary info: still shown
  });
});
