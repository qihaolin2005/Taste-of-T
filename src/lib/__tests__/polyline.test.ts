import { describe, expect, it } from "vitest";
import { decodePolyline } from "@/lib/polyline";
import { getLines, getStations } from "@/lib/mbta/stations";

describe("decodePolyline", () => {
  it("decodes Google's reference example", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it("decodes every MBTA shape in the snapshot to points around Boston", () => {
    for (const line of getLines()) {
      expect(line.shapes.length).toBeGreaterThan(0);
      for (const shape of line.shapes) {
        const pts = decodePolyline(shape);
        expect(pts.length).toBeGreaterThan(10);
        for (const p of pts) {
          expect(p.lat).toBeGreaterThan(42.1);
          expect(p.lat).toBeLessThan(42.5);
          expect(p.lng).toBeGreaterThan(-71.3);
          expect(p.lng).toBeLessThan(-70.9);
        }
      }
    }
  });
});

describe("stations snapshot", () => {
  it("has every line's stations and known interchanges", () => {
    const byId = new Map(getStations().map((s) => [s.id, s]));
    for (const line of getLines()) for (const id of line.stationIds) expect(byId.has(id)).toBe(true);
    expect(byId.get("place-pktrm")?.lines).toEqual(expect.arrayContaining(["Red", "Green-B"]));
    expect(byId.get("place-dwnxg")?.lines).toEqual(expect.arrayContaining(["Red", "Orange"]));
  });
});
