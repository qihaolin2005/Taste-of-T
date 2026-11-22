import { describe, expect, it } from "vitest";
import { checkDietary, dietaryHighlights, dietFit, filterByDietary, fitFor, normalizeDietary, recommendForUser, RECOMMENDER_CONFIG, selectByDietary, unionDietary, type RestaurantCandidate } from "@/features/ml";

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

  it("activities skip the dietary filter; food with unknown info still fails", () => {
    const karaoke = place("karaoke", { category: "activity", tags: ["karaoke"] });
    const unknownDinner = place("unknown-dinner");
    const unknownDessert = place("unknown-dessert", { category: "dessert" });
    for (const needs of [["vegan"], ["halal", "kosher"], ["gluten-free"]]) {
      expect(checkDietary(karaoke, needs).ok).toBe(true);
      expect(checkDietary(unknownDinner, needs).ok).toBe(false);
      expect(checkDietary(unknownDessert, needs).ok).toBe(false);
    }
    expect(filterByDietary([karaoke, unknownDinner], ["vegan"]).map((p) => p.id)).toEqual(["karaoke"]);
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

describe("dietary fit levels (vegetarian / vegan are soft, everything else strict)", () => {
  // What Google gives us: "serves vegetarian food" -> mixed + ["vegetarian"], nothing about vegan.
  const googleVeg = (id: string, cuisines: string[]) => place(id, { dietStyle: "mixed", dietary: ["vegetarian"], cuisines });
  const thai = googleVeg("thai", ["thai"]);
  const burgers = googleVeg("burgers", ["burgers"]);
  const noInfo = place("no-info", { cuisines: ["italian"] });
  const bbq = place("bbq", { cuisines: ["bbq"] });

  it("vegetarian: listed or veg menus are yes; unknown places are likely, unless meat-centric", () => {
    expect(fitFor(mixedVeg, "vegetarian")).toBe("yes");
    expect(fitFor(veganOnly, "vegetarian")).toBe("yes");
    expect(fitFor(noInfo, "vegetarian")).toBe("likely");
    expect(fitFor(bbq, "vegetarian")).toBe("maybe");
    expect(fitFor(steakhouse, "vegetarian")).toBe("no");
    expect(fitFor(steakLying, "vegetarian")).toBe("no");
  });

  it("vegan: vegetarian options at a plant-forward cuisine are likely; other places are maybe", () => {
    expect(fitFor(mixedVegan, "vegan")).toBe("yes");
    expect(fitFor(vegOnly, "vegan")).toBe("likely");
    expect(fitFor(thai, "vegan")).toBe("likely");
    expect(fitFor(burgers, "vegan")).toBe("maybe");
    expect(fitFor(noInfo, "vegan")).toBe("maybe");
    expect(fitFor(steakhouse, "vegan")).toBe("no");
  });

  it("halal, kosher and allergies stay strict: listed or out", () => {
    for (const need of ["halal", "kosher", "gluten-free", "nut-free"]) {
      expect(fitFor(noInfo, need)).toBe("no");
      expect(fitFor(thai, need)).toBe("no");
    }
    expect(fitFor(halal, "halal")).toBe("yes");
    expect(dietFit(halal, ["vegan", "halal"])).toBe("likely"); // a Thai place with vegetarian options
    expect(dietFit(noInfo, ["vegan", "halal"])).toBe("no");
  });

  it("selection always keeps yes + likely and only adds maybe when too few are left", () => {
    const fewer = selectByDietary([veganOnly, thai, burgers, steakhouse], ["vegan"]);
    expect(fewer.usedMaybe).toBe(true);
    expect(fewer.kept.map((p) => p.id)).toEqual(["vegan-only", "thai", "burgers"]);
    const many = Array.from({ length: RECOMMENDER_CONFIG.dietary.minPool }, (_, i) => googleVeg(`thai${i}`, ["thai"]));
    const plenty = selectByDietary([...many, burgers, steakhouse], ["vegan"]);
    expect(plenty.usedMaybe).toBe(false);
    expect(plenty.kept).toHaveLength(many.length);
  });

  it("reasons are honest about how sure we are", () => {
    expect(dietaryHighlights(mixedVegan, ["vegan"])).toEqual(["has vegan options"]);
    expect(dietaryHighlights(thai, ["vegan"])).toEqual(["likely has vegan options"]);
    expect(dietaryHighlights(burgers, ["vegan"])).toEqual(["check the menu for vegan options"]);
  });

  it("a vegan on Google-style data gets a full list, confirmed places first", () => {
    const at = { lat: 42.3505, lng: -71.0763, stationId: "place-coecl", city: "Boston" };
    const cuisines = ["thai", "indian", "mexican", "burgers", "italian", "pizza", "chinese", "korean", "american", "sandwiches"];
    const places: RestaurantCandidate[] = [
      ...cuisines.flatMap((c) => [0, 1, 2, 3, 4].map((i) => googleVeg(`${c}${i}`, [c]))),
      place("vegan-cafe", { dietStyle: "vegan-only", cuisines: ["cafe"], rating: 4.6, reviewCount: 300 }),
    ].map((p) => ({ ...p, ...at, rating: p.rating ?? 4.4, reviewCount: p.reviewCount ?? 300 }));
    const ctx = { userId: "u", preferences: { dietary: ["vegan"], avoid: [], tastes: [] }, history: { ratings: [], wishlistPlaceIds: [], checkInPlaceIds: [] }, location: { lat: at.lat, lng: at.lng } };
    const strict = filterByDietary(places, ["vegan"]);
    expect(strict).toHaveLength(1); // the old rule: 51 -> 1
    const r = recommendForUser(ctx as never, places, { limit: 10 });
    expect(r.results).toHaveLength(10);
    expect(r.results[0].place.id).toBe("vegan-cafe");
  });
});
