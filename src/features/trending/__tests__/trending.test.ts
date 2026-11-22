import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { getOrCreateUser } from "@/features/users";
import type { RestaurantCandidate } from "@/features/ml";
import { rankTrending, recentBuzz, type Buzz } from "@/features/trending";

const NOW = new Date("2026-11-21T23:30:00Z");
const place = (id: string, extra: Partial<RestaurantCandidate> = {}): RestaurantCandidate => ({
  id,
  name: `Place ${id}`,
  category: "dinner",
  tags: ["ramen"],
  pricePerPerson: 20,
  stationId: "place-pktrm",
  lat: 42.35,
  lng: -71.06,
  ...extra,
});

describe("rankTrending", () => {
  const places = [
    place("famous", { rating: 4.8, reviewCount: 5000 }),
    place("fewreviews", { rating: 5, reviewCount: 3 }),
    place("buzzing", { rating: 4.1, reviewCount: 200 }),
    place("visited", { rating: 3.9, reviewCount: 100 }),
    place("activity", { category: "activity", rating: 4.9, reviewCount: 9000 }),
    place("nopin", { lat: undefined, rating: 4.9, reviewCount: 9000 }),
  ];

  it("app activity beats Google ratings, and a visit beats a few likes", () => {
    const buzz = new Map<string, Buzz>([
      ["buzzing", { likes: 3, visits: 0, loved: 0 }],
      ["visited", { likes: 0, visits: 1, loved: 0 }],
    ]);
    const r = rankTrending(places, buzz);
    expect(r.map((x) => x.id).slice(0, 3)).toEqual(["visited", "buzzing", "famous"]);
    expect(r[0]).toMatchObject({ buzzing: true, why: "1 visit this week" });
    expect(r[1].why).toBe("3 likes this week");
    expect(r[2]).toMatchObject({ buzzing: false, why: "★ 4.8 · 5.0k reviews" });
  });

  it("without activity, many good reviews beat a perfect score from 3 people", () => {
    const r = rankTrending(places, new Map());
    expect(r.findIndex((x) => x.id === "famous")).toBeLessThan(r.findIndex((x) => x.id === "fewreviews"));
  });

  it("skips activities and places that can't be shown on the map, and respects the limit", () => {
    const ids = rankTrending(places, new Map()).map((x) => x.id);
    expect(ids).not.toContain("activity");
    expect(ids).not.toContain("nopin");
    expect(rankTrending(places, new Map(), 2)).toHaveLength(2);
  });
});

describe("recentBuzz", () => {
  const db = createTestDb();
  afterAll(() => db.$disconnect());

  it("counts this week's likes, distinct visitors and 8+ ratings; ignores older activity", async () => {
    const [a, b] = [(await getOrCreateUser(db, null)).user.id, (await getOrCreateUser(db, null)).user.id];
    const old = new Date(NOW.getTime() - 10 * 86_400_000);
    await db.swipe.createMany({
      data: [
        { userId: a, placeId: "p1", liked: true, source: "solo" },
        { userId: b, placeId: "p1", liked: true, source: "solo" },
        { userId: a, placeId: "p2", liked: false, source: "solo" },
      ],
    });
    const visit = (userId: string, receiptKey: string, createdAt = NOW) =>
      ({ userId, placeId: "p2", day: "2026-11-21", receiptTotal: 20, dinersOnReceipt: 1, receiptDate: NOW.toISOString(), receiptKey, travelMode: "none", basePoints: 30, pointsAwarded: 30, breakdown: {}, createdAt });
    await db.rewardVisit.createMany({ data: [visit(a, "k1"), visit(a, "k2"), visit(b, "k3"), visit(b, "k4", old)] });
    await db.rating.createMany({ data: [{ userId: a, placeId: "p3", score: 9 }, { userId: b, placeId: "p3", score: 4 }] });

    const buzz = await recentBuzz(db, new Date(Date.now() + 60_000));
    expect(buzz.get("p1")).toEqual({ likes: 2, visits: 0, loved: 0 });
    expect(buzz.get("p2")).toEqual({ likes: 0, visits: 2, loved: 0 }); // a's two visits count once; b's 10-day-old one is ignored
    expect(buzz.get("p3")).toEqual({ likes: 0, visits: 0, loved: 1 });
  });
});
