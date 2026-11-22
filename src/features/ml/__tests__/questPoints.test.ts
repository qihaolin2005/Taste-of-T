import { describe, expect, it } from "vitest";
import { QUEST_POINTS_CONFIG, questPoints } from "@/features/ml";

const pts = (priceLevel: number | null, distanceMiles: number | null) => questPoints({ priceLevel, distanceMiles }).points;

describe("quest points", () => {
  it("a cheap place right next door is the base", () => {
    expect(pts(1, 0)).toBe(QUEST_POINTS_CONFIG.base);
  });

  it("farther places pay a bit more, up to a cap", () => {
    expect(pts(1, 1)).toBeGreaterThan(pts(1, 0.2));
    expect(pts(1, 3)).toBeGreaterThan(pts(1, 1));
    expect(pts(1, 50)).toBe(pts(1, 5)); // capped
    expect(pts(1, 50) / pts(1, 0)).toBeLessThanOrEqual(1.5); // only "a bit"
  });

  it("pricier places pay a lot more", () => {
    expect(pts(2, 1)).toBeGreaterThan(pts(1, 1));
    expect(pts(3, 1)).toBeGreaterThan(pts(2, 1));
    expect(pts(4, 1)).toBeGreaterThan(pts(3, 1));
    // price matters more than distance: a $$ place next door beats a $ place far away
    expect(pts(2, 0)).toBeGreaterThan(pts(1, 5));
    expect(pts(4, 0)).toBeGreaterThanOrEqual(3 * pts(1, 0));
  });

  it("examples", () => {
    expect(pts(1, 0.3)).toBe(105);
    expect(pts(2, 1)).toBe(195);
    expect(pts(3, 2)).toBe(300);
    expect(pts(4, 5)).toBe(600);
  });

  it("unknown price or distance falls back safely, and points are whole, positive, multiples of 5", () => {
    expect(pts(null, null)).toBe(QUEST_POINTS_CONFIG.base);
    expect(pts(9, -3)).toBe(QUEST_POINTS_CONFIG.base);
    for (const p of [1, 2, 3, 4, null]) for (const d of [0, 0.37, 1.9, 4.4, null]) {
      const n = pts(p, d);
      expect(Number.isInteger(n) && n > 0 && n % 5 === 0).toBe(true);
    }
  });

  it("explains itself", () => {
    expect(questPoints({ priceLevel: 2, distanceMiles: 1.2 })).toEqual({ base: 100, distanceBonus: 12, priceLevel: 2, priceMultiplier: 1.75, points: 195 });
  });
});
