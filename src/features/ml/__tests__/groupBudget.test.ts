import { describe, expect, it } from "vitest";
import { withinGroupBudget, type SessionMember } from "@/features/ml/session";
import type { RestaurantCandidate } from "@/features/ml";

const member = (id: string, budget: number | null) => ({ memberId: id, ctx: { preferences: { budgetPerPerson: budget } } }) as unknown as SessionMember;
const place = (id: string, pricePerPerson: number, category: RestaurantCandidate["category"] = "dinner") => ({ id, pricePerPerson, category }) as RestaurantCandidate;

describe("group budget ($30 squad used to get $$$ places)", () => {
  const cheap = Array.from({ length: 12 }, (_, i) => place(`cheap-${i}`, 12 + i));
  const pricey = [place("steak-$$$", 50), place("omakase-$$$$", 85)];

  it("uses the tightest member budget and keeps over-budget places off the deck when enough fit", () => {
    const r = withinGroupBudget([member("a", 60), member("b", 30)], [...cheap, ...pricey], "dinner", 10, 10);
    expect(r.overBudget).toBe(false);
    expect(r.pool.map((p) => p.id)).not.toContain("steak-$$$");
    expect(r.pool.every((p) => p.pricePerPerson <= 30)).toBe(true);
  });

  it("fills with the cheapest over-budget places only when too few fit, and says so", () => {
    const r = withinGroupBudget([member("a", 30)], [place("ok", 20), ...pricey], "dinner", 10, 10);
    expect(r.overBudget).toBe(true);
    expect(r.pool.map((p) => p.id)).toEqual(["ok", "steak-$$$", "omakase-$$$$"]);
  });

  it("only filters the night's kind of place, and does nothing without budgets", () => {
    const dessert = place("fancy-dessert", 40, "dessert");
    expect(withinGroupBudget([member("a", 30)], [...cheap, dessert], "dinner", 10, 10).pool).toContain(dessert);
    const all = [...cheap, ...pricey];
    expect(withinGroupBudget([member("a", null), member("b", 0)], all, "dinner", 10, 10)).toEqual({ pool: all, overBudget: false });
  });
});
