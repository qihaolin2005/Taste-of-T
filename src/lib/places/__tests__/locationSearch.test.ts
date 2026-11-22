import { describe, expect, it } from "vitest";
import { getStation } from "@/lib/mbta/stations";
import { HOME_MAX_METERS, homeNear, matchStations } from "@/lib/places/locationSearch";

describe("Going home to: search", () => {
  it("finds T stations by any part of their name, best match first", () => {
    const davis = matchStations("davis");
    expect(davis[0]).toMatchObject({ kind: "station", stationId: "place-davis", title: "Davis" });
    expect(matchStations("harv").map((s) => s.title)).toEqual(expect.arrayContaining(["Harvard", "Harvard Avenue"]));
    expect(matchStations("harv")[0].title).toBe("Harvard"); // shortest name that starts with it
    expect(matchStations("zzzz-not-a-place")).toEqual([]);
    expect(matchStations("   ")).toEqual([]);
  });

  it("turns an address into the nearest T station the planner can route home to", () => {
    // A few blocks from Davis Square
    const home = homeNear({ lat: 42.3975, lng: -71.1192 }, "Elm St");
    expect(home).toMatchObject({ stationId: "place-davis", label: "Elm St" });
    expect(home!.walkMinutes).toBeGreaterThan(0);
    expect(getStation(home!.stationId)).toBeDefined(); // a real station id: passes memberInputSchema
  });

  it("refuses places far from the T instead of guessing", () => {
    expect(HOME_MAX_METERS).toBe(3000);
    expect(homeNear({ lat: 42.6, lng: -71.8 }, "Fitchburg-ish")).toBeNull();
  });
});
