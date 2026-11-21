import { describe, expect, it } from "vitest";
import { checkDietary, filterByDietary, normalizeDietary, unionDietary, type RestaurantCandidate } from "@/features/ml";

const base = { category: "dinner", tags: ["thai"], pricePerPerson: 20, stationId: "place-pktrm" } as const;
const place = (id: string, extra: Partial<RestaurantCandidate> = {}): RestaurantCandidate => ({ ...base, id, tags: [...base.tags], ...extra });

const steakhouse = place("steak", { dietStyle: "non-veg-only" });
const steakLying = place("steak-lying", { dietStyle: "non-veg-only", dietary: ["vegetarian", "vegan"] });
const mixedVeg = place("mixed-veg", { dietStyle: "mixed", dietary: ["vegetarian"] });
const mixedVegan = place("mixed-vegan", { dietary: ["vegan"] });
const vegOnly = place("veg-only", { dietStyle: "veg-only" });
const veganOnly = place("vegan-only", { dietStyle: "vegan-only" });
const unknown = place("unknown");
const emptyList = place("empty", { dietary: [] });
const mixedNoInfo = place("mixed-no-info", { dietStyle: "mixed" });
const halal = place("halal", { dietary: ["halal", "vegetarian"] });
const glutenFree = place("gf", { dietary: ["gluten-free"] });

const all = [steakhouse, steakLying, mixedVeg, mixedVegan, vegOnly, veganOnly, unknown, emptyList, mixedNoInfo, halal, glutenFree];
const ids = (xs: RestaurantCandidate[]) => xs.map((x) => x.id).sort();

describe("dietary filter", () => {
  it("passes everything when there are no restrictions", () => {
    expect(filterByDietary(all, [])).toHaveLength(all.length);
  });

  it("vegetarian: excludes non-veg-only and unknown, requires vegetarian options", () => {
    expect(ids(filterByDietary(all, ["vegetarian"]))).toEqual(ids([mixedVeg, mixedVegan, vegOnly, veganOnly, halal]));
  });

  it("vegan: requires vegan options; vegetarian-only places are out", () => {
    expect(ids(filterByDietary(all, ["vegan"]))).toEqual(ids([mixedVegan, veganOnly]));
    expect(checkDietary(vegOnly, ["vegan"])).toEqual({ ok: false, failed: ["vegan"] });
  });

  it("non-veg-only always fails veg/vegan, even with a contradictory dietary list", () => {
    expect(checkDietary(steakLying, ["vegetarian"]).ok).toBe(false);
    expect(checkDietary(steakLying, ["vegan"]).ok).toBe(false);
  });

  it("treats unknown dietary info as not supported", () => {
    for (const need of ["vegetarian", "vegan", "halal", "kosher", "gluten-free"]) {
      expect(checkDietary(unknown, [need]).ok).toBe(false);
      expect(checkDietary(emptyList, [need]).ok).toBe(false);
      expect(checkDietary(mixedNoInfo, [need]).ok).toBe(false);
    }
  });

  it("other restrictions must be listed explicitly", () => {
    expect(ids(filterByDietary(all, ["halal"]))).toEqual(["halal"]);
    expect(ids(filterByDietary(all, ["gluten-free"]))).toEqual(["gf"]);
    expect(filterByDietary(all, ["kosher"])).toEqual([]);
  });

  it("restrictions outside the known vocabulary work the same way", () => {
    const sesameFree = place("sesame", { dietary: ["sesame-free"] });
    expect(ids(filterByDietary([...all, sesameFree], ["sesame-free"]))).toEqual(["sesame"]);
  });

  it("multiple restrictions must all be satisfied", () => {
    expect(ids(filterByDietary(all, ["vegetarian", "halal"]))).toEqual(["halal"]);
    expect(checkDietary(mixedVeg, ["vegetarian", "gluten-free"])).toEqual({ ok: false, failed: ["gluten-free"] });
  });

  it("is case- and whitespace-insensitive on both sides", () => {
    const shouty = place("shouty", { dietary: [" Vegan "] });
    expect(checkDietary(shouty, ["VEGAN"]).ok).toBe(true);
    expect(normalizeDietary([" Vegan", "vegan", ""])).toEqual(["vegan"]);
  });

  it("groups use the union: vegetarian + vegan means every place must satisfy both", () => {
    const needs = unionDietary([["vegetarian"], ["vegan"], [], null]);
    expect(needs.sort()).toEqual(["vegan", "vegetarian"]);
    expect(ids(filterByDietary(all, needs))).toEqual(ids([mixedVegan, veganOnly]));
  });

  it("never lets a bad match through (exhaustive over generated places)", () => {
    const styles = [undefined, "veg-only", "vegan-only", "non-veg-only", "mixed"] as const;
    const lists = [undefined, [], ["vegetarian"], ["vegan"], ["halal"], ["vegetarian", "vegan", "halal"]];
    const needsSets = [["vegetarian"], ["vegan"], ["halal"], ["vegetarian", "halal"], ["vegan", "vegetarian"]];
    for (const dietStyle of styles)
      for (const dietary of lists)
        for (const needs of needsSets) {
          const p = place("x", { dietStyle, dietary });
          if (!checkDietary(p, needs).ok) continue;
          const listed = new Set(dietary ?? []);
          for (const n of needs) {
            if (n === "vegetarian") expect(dietStyle !== "non-veg-only" && (dietStyle === "veg-only" || dietStyle === "vegan-only" || listed.has("vegetarian") || listed.has("vegan"))).toBe(true);
            else if (n === "vegan") expect(dietStyle !== "non-veg-only" && (dietStyle === "vegan-only" || listed.has("vegan"))).toBe(true);
            else expect(listed.has(n)).toBe(true);
          }
        }
  });
});
