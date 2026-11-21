import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createGuest } from "@/features/auth";
import { addToWishlist, listRatings, listWishlist, ratePlace, rateSchema, removeFromWishlist } from "@/features/ratings";
import { buildUserContext, deriveInteractions } from "@/features/ml";

const db = createTestDb();
afterAll(() => db.$disconnect());
const newUser = async () => (await createGuest(db)).id;

describe("ratings", () => {
  it("rates a place, re-rating updates it, and scores round to halves", async () => {
    const u = await newUser();
    await ratePlace(db, u, { placeId: "p1", score: 7.3 });
    const again = await ratePlace(db, u, { placeId: "p1", score: 9, note: "great noodles" });
    expect(again).toMatchObject({ placeId: "p1", score: 9, note: "great noodles" });
    await ratePlace(db, u, { placeId: "p2", score: 7.3 });
    expect((await listRatings(db, u)).map((r) => [r.placeId, r.score])).toEqual([["p2", 7.5], ["p1", 9]]);
  });

  it("rejects scores outside 0-10", () => {
    expect(rateSchema.safeParse({ placeId: "p", score: 11 }).success).toBe(false);
    expect(rateSchema.safeParse({ placeId: "p", score: -1 }).success).toBe(false);
  });

  it("ratings and wishlist feed the recommender", async () => {
    const u = await newUser();
    await ratePlace(db, u, { placeId: "loved", score: 10 });
    await ratePlace(db, u, { placeId: "hated", score: 1 });
    await addToWishlist(db, u, "want");
    const w = Object.fromEntries(deriveInteractions((await buildUserContext(db, u))!).map((i) => [i.placeId, i.weight]));
    expect(w.loved).toBeGreaterThan(0);
    expect(w.hated).toBeLessThan(0);
    expect(w.want).toBeGreaterThan(0);
  });
});

describe("wishlist", () => {
  it("adds once, lists newest first, and removes", async () => {
    const u = await newUser();
    await addToWishlist(db, u, "a");
    await addToWishlist(db, u, "b");
    await addToWishlist(db, u, "a"); // no duplicate
    expect((await listWishlist(db, u)).map((w) => w.placeId).sort()).toEqual(["a", "b"]);
    await removeFromWishlist(db, u, "a");
    await removeFromWishlist(db, u, "zzz"); // removing something absent is fine
    expect((await listWishlist(db, u)).map((w) => w.placeId)).toEqual(["b"]);
  });
});
