import { describe, expect, it } from "vitest";
import { distanceMeters, nearestStation, walkMinutes } from "@/lib/geo";

const parkSt = { lat: 42.35639, lng: -71.0624 };
const dtx = { lat: 42.35552, lng: -71.06036 };

describe("geo", () => {
  it("measures short city distances", () => {
    const m = distanceMeters(parkSt, dtx);
    expect(m).toBeGreaterThan(150);
    expect(m).toBeLessThan(250);
  });

  it("estimates walk minutes with a street detour factor", () => {
    expect(walkMinutes(parkSt, dtx)).toBe(4);
  });

  it("picks the closest station within range", () => {
    const stations = [{ id: "park", ...parkSt }, { id: "dtx", ...dtx }];
    expect(nearestStation({ lat: 42.3556, lng: -71.0605 }, stations)?.station.id).toBe("dtx");
    expect(nearestStation({ lat: 42.0, lng: -71.0 }, stations)).toBeNull();
  });
});
