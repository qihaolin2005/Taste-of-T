import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createGuest } from "@/features/auth";
import { getSeedPlaces } from "@/lib/places";
import type { RecommendationItem } from "@/features/ml";
import { pickSpin, SPIN_POOL, spinRequestSchema, spinTheT } from "@/features/spin";
import { addPoints, finishTrip, startTrip } from "@/features/trips";

const db = createTestDb();
afterAll(() => db.$disconnect());

const item = (id: string, score: number, extra: Partial<RecommendationItem> = {}): RecommendationItem => ({
  placeId: id,
  name: id,
  category: "dinner",
  score,
  reason: "because",
  reasons: [],
  distanceMiles: 0.5,
  cuisines: ["thai"],
  rating: 4.5,
  priceLevel: 2,
  neighborhood: null,
  components: {} as RecommendationItem["components"],
  ...extra,
});
const req = (r: Partial<Parameters<typeof pickSpin>[1]> = {}) => ({ radiusMiles: 1, craving: "anything" as const, exclude: [], ...r });

describe("picking from the model's ranking", () => {
  const ranked = [
    item("thai-1", 0.9),
    item("ramen-1", 0.8, { cuisines: ["ramen", "japanese"], priceLevel: 3 }),
    item("thai-2", 0.7, { priceLevel: 1 }),
    item("pizza-1", 0.6, { cuisines: ["pizza"], priceLevel: 1 }),
  ];

  it("applies craving and budget", () => {
    expect(pickSpin(ranked, req({ craving: "ramen" }))?.pick.placeId).toBe("ramen-1");
    expect(pickSpin(ranked, req({ craving: "thai", budget: 1 }))?.pick.placeId).toBe("thai-2");
  });

  it("matches cravings by name too (Google has no 'dumplings' or 'tacos' type)", () => {
    const google = [
      item("g1", 0.9, { name: "Boston Burger Co", cuisines: ["burgers"] }),
      item("g2", 0.8, { name: "Gourmet Dumpling House", cuisines: ["chinese"] }),
      item("g3", 0.7, { name: "El Jefe's Taqueria", cuisines: ["mexican"] }),
    ];
    expect(pickSpin(google, req({ craving: "dumplings" }))).toMatchObject({ pick: { placeId: "g2" }, notes: [] });
    expect(pickSpin(google, req({ craving: "tacos" }))?.pick.placeId).toBe("g3");
  });

  it("spins: better matches are likelier, but it isn't always #1", () => {
    const counts = new Map<string, number>();
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const id = pickSpin(ranked, req(), rng)!.pick.placeId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.size).toBe(4);
    expect(counts.get("thai-1")!).toBeGreaterThan(counts.get("pizza-1")!);
  });

  it("only spins over the top few", () => {
    const many = Array.from({ length: 20 }, (_, i) => item(`p${i}`, 1 - i / 40));
    const picks = new Set(Array.from({ length: 300 }, () => pickSpin(many, req())!.pick.placeId));
    expect([...picks].every((id) => Number(id.slice(1)) < SPIN_POOL)).toBe(true);
  });

  it("loosens filters instead of coming back empty, and says so", () => {
    const noRamenCheap = pickSpin(ranked, req({ craving: "sushi" }));
    expect(noRamenCheap?.notes[0]).toMatch(/No sushi within 1 mi/);
    const pricey = pickSpin([item("a", 0.9, { priceLevel: 4 })], req({ budget: 1 }));
    expect(pricey?.notes[0]).toMatch(/budget/);
    expect(pickSpin([], req())).toBeNull();
  });

  it("Spin again skips places you've seen, then starts over", () => {
    const r = pickSpin(ranked, req({ exclude: ["thai-1", "ramen-1", "thai-2"] }));
    expect(r?.pick.placeId).toBe("pizza-1");
    const all = pickSpin(ranked, req({ exclude: ranked.map((x) => x.placeId) }));
    expect(all?.notes[0]).toMatch(/starting over/);
  });

  it("asks for distance, not time", () => {
    expect(spinRequestSchema.safeParse({ radiusMiles: 2 }).success).toBe(true);
    expect(spinRequestSchema.safeParse({ minutes: 30 }).success).toBe(false);
  });
});

const seedCoords = async (id: string) => {
  const p = getSeedPlaces().find((x) => x.id === id);
  return p && typeof p.lat === "number" && typeof p.lng === "number" ? { lat: p.lat, lng: p.lng } : null;
};
const CHINATOWN = { lat: 42.3515, lng: -71.0625 };

describe("Spin the T with the ML recommender", () => {
  it("picks a nearby place from the model, near where you are, and makes it a quest", async () => {
    const u = (await createGuest(db)).id;
    const r = await spinTheT(db, u, spinRequestSchema.parse({ origin: CHINATOWN, radiusMiles: 0.5 }), { findPlace: seedCoords, rng: () => 0 });
    expect(r.model).toBeTruthy();
    expect(r.origin?.source).toBe("override"); // your GPS position, not a station
    expect(r.place.distanceMiles!).toBeLessThanOrEqual(0.5);
    expect(r.place.lat).not.toBeNull();
    expect(r.quest).toMatchObject({ status: "active", points: 100, title: `Eat at ${r.place.name}` });
    // the place was "shown", so the rewards system counts a visit there as recommended
    expect(await db.recommendationShown.count({ where: { userId: u, placeId: r.place.placeId } })).toBe(1);
  });

  it("a farther distance finds more places; a tiny one far from everything finds none", async () => {
    const u = (await createGuest(db)).id;
    const near = await spinTheT(db, u, spinRequestSchema.parse({ origin: CHINATOWN, radiusMiles: 0.5 }), { findPlace: seedCoords });
    const far = await spinTheT(db, u, spinRequestSchema.parse({ origin: CHINATOWN, radiusMiles: 5 }), { findPlace: seedCoords });
    expect(far.found).toBeGreaterThan(near.found);
    await expect(spinTheT(db, u, spinRequestSchema.parse({ origin: { lat: 42.2, lng: -70.9 }, radiusMiles: 0.5 }), { findPlace: seedCoords })).rejects.toThrow(/bigger distance/);
  });

  it("a specific craving searches near you too, so a place missing from the general list can still come up", async () => {
    const u = (await createGuest(db)).id;
    const hidden = {
      id: "g-gourmet-dumpling",
      name: "Gourmet Dumpling House",
      category: "dinner",
      tags: ["chinese"],
      cuisines: ["chinese"],
      pricePerPerson: 18,
      priceLevel: 1,
      stationId: "place-chncl",
      lat: 42.3513,
      lng: -71.0609,
      rating: 4.6,
      ratingCount: 3000,
    };
    const asked: string[] = [];
    // (the demo list's own dumpling place is excluded, so only the searched one can match)
    const r = await spinTheT(db, u, spinRequestSchema.parse({ origin: CHINATOWN, radiusMiles: 0.5, craving: "dumplings", budget: 1, exclude: ["seed-lantern-dumpling-house"] }), {
      findPlace: async () => null, // not in the general list
      searchCraving: async (_c, text) => (asked.push(text), [hidden]),
      rng: () => 0,
    });
    expect(asked).toEqual(["dumplings"]);
    expect(r.notes).toEqual([]);
    expect(r.place).toMatchObject({ placeId: "g-gourmet-dumpling", lat: 42.3513 });
    // the quest knows where it is, so its trip doesn't need the place list
    const trip = await startTrip(db, u, { questId: r.quest.id });
    expect(trip.place).toMatchObject({ id: "g-gourmet-dumpling", lat: 42.3513 });
  });

  it("spinning again replaces the quest you didn't do", async () => {
    const u = (await createGuest(db)).id;
    const a = await spinTheT(db, u, spinRequestSchema.parse({ origin: CHINATOWN, radiusMiles: 1 }), { findPlace: seedCoords });
    await spinTheT(db, u, spinRequestSchema.parse({ origin: CHINATOWN, radiusMiles: 1, exclude: [a.place.placeId] }), { findPlace: seedCoords });
    expect((await db.quest.findUniqueOrThrow({ where: { id: a.quest.id } })).status).toBe("abandoned");
    expect(await db.quest.count({ where: { userId: u, status: "active" } })).toBe(1);
  });
});

describe("going there completes the quest", () => {
  const T0 = new Date("2026-11-21T23:00:00Z");
  const at = (s: number) => new Date(T0.getTime() + s * 1000);
  const north = (lat: number, m: number) => lat + m / 111_320;

  async function quest() {
    const u = (await createGuest(db)).id;
    const r = await spinTheT(db, u, spinRequestSchema.parse({ origin: CHINATOWN, radiusMiles: 1 }), { findPlace: seedCoords, now: T0 });
    const place = { id: r.place.placeId, name: r.place.name, lat: r.place.lat!, lng: r.place.lng! };
    return { u, r, place };
  }

  it("arriving on the trip pays the quest's points, once", async () => {
    const { u, r, place } = await quest();
    const trip = await startTrip(db, u, { place, questId: r.quest.id }, T0);
    // walk 500 m north to the place over ~6 minutes
    const fixes = Array.from({ length: 26 }, (_, i) => ({ lat: north(place.lat, -500 + i * 20), lng: place.lng, t: at(i * 15).getTime(), accuracyM: 8 }));
    const done = await addPoints(db, u, trip.id, fixes, at(400));
    expect(done).toMatchObject({ status: "finished", arrived: true, questAwarded: 100 });
    expect((await db.user.findUniqueOrThrow({ where: { id: u } })).xp).toBe(100);
    expect((await db.quest.findUniqueOrThrow({ where: { id: r.quest.id } })).status).toBe("completed");
  });

  it("tapping I'm Here close to the place counts too", async () => {
    const { u, r, place } = await quest();
    const trip = await startTrip(db, u, { place, questId: r.quest.id }, T0);
    await addPoints(db, u, trip.id, [{ lat: north(place.lat, -600), lng: place.lng, t: at(0).getTime() }, { lat: north(place.lat, -100), lng: place.lng, t: at(300).getTime() }], at(300));
    expect(await finishTrip(db, u, trip.id, at(310))).toMatchObject({ arrived: true, questAwarded: 100 });
  });

  it("no points for teleporting: starting at the door, or a trip to a different place", async () => {
    const { u, r, place } = await quest();
    const trip = await startTrip(db, u, { place, questId: r.quest.id }, T0);
    const done = await addPoints(db, u, trip.id, [{ lat: place.lat, lng: place.lng, t: at(1).getTime() }], at(2));
    expect(done.arrived).toBe(true);
    expect(done.questAwarded).toBe(0);
    const other = getSeedPlaces().find((p) => p.id !== place.id && typeof p.lat === "number")!;
    await expect(startTrip(db, u, { place: { id: other.id, name: other.name ?? null, lat: other.lat!, lng: other.lng! }, questId: r.quest.id }, T0)).rejects.toThrow(
      /quest's restaurant/,
    );
  });
});
