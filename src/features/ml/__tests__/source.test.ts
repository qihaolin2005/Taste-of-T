import { describe, expect, it } from "vitest";
import { loadRestaurants, type RestaurantSource } from "@/features/ml";
import { ALL_PLACES } from "../recommend/__tests__/fixtures";

const SEED = ALL_PLACES.slice(0, 2);
const seed = () => ({ places: SEED, skipped: 0 });
const ids = (r: { places: { id: string }[] }) => r.places.map((p) => p.id);

describe("loadRestaurants", () => {
  it("uses the seed list when there's no source", async () => {
    const r = await loadRestaurants(null, { seed });
    expect(r).toMatchObject({ from: "seed", skipped: 0, warnings: [] });
    expect(ids(r)).toEqual(ids({ places: SEED }));
  });

  it("warns when the seed list is empty", async () => {
    const r = await loadRestaurants(undefined, { seed: () => ({ places: [], skipped: 0 }) });
    expect(r.places).toEqual([]);
    expect(r.warnings).toEqual(["No restaurants available yet: data/seed-restaurants.json is empty."]);
  });

  it("uses the live source when it works, validating every record", async () => {
    const source: RestaurantSource = async () => [...ALL_PLACES, { id: "broken" }, "nonsense", { ...ALL_PLACES[0], id: "extra", googlePlaceId: "abc" }];
    const r = await loadRestaurants(source, { seed });
    expect(r.from).toBe("source");
    expect(r.places).toHaveLength(ALL_PLACES.length + 1);
    expect(r.skipped).toBe(2);
    expect(r.warnings).toEqual(["Skipped 2 restaurants from the restaurant source with invalid data."]);
    expect(r.places.find((p) => p.id === "extra")).not.toHaveProperty("googlePlaceId"); // unknown fields dropped
  });

  it("falls back to the seed list when the source throws", async () => {
    const r = await loadRestaurants(async () => { throw new Error("quota exceeded"); }, { seed });
    expect(r.from).toBe("seed");
    expect(ids(r)).toEqual(ids({ places: SEED }));
    expect(r.warnings[0]).toBe("The restaurant source failed (quota exceeded); using the offline list.");
  });

  it("falls back when the source returns nothing usable", async () => {
    for (const bad of [async () => [], async () => [{ id: "x" }]] as RestaurantSource[]) {
      const r = await loadRestaurants(bad, { seed });
      expect(r.from).toBe("seed");
      expect(r.warnings.join(" ")).toMatch(/returned no usable restaurants/);
    }
    const notAList = (async () => ({ places: [] })) as unknown as RestaurantSource;
    expect((await loadRestaurants(notAList, { seed })).warnings[0]).toMatch(/did not return a list/);
  });

  it("times out a slow source, aborts it, and falls back", async () => {
    let aborted = false;
    const slow: RestaurantSource = ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener("abort", () => (aborted = true));
        setTimeout(() => resolve(ALL_PLACES), 1000);
      });
    const r = await loadRestaurants(slow, { seed, timeoutMs: 20 });
    expect(r.from).toBe("seed");
    expect(r.warnings[0]).toMatch(/timed out after 20 ms/);
    expect(aborted).toBe(true);
  });
});
