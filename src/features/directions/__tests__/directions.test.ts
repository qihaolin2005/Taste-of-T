import { describe, expect, it } from "vitest";
import { getLines, getStations } from "@/lib/mbta/stations";
import { buildNetwork, googleMapsDirectionsUrl, lineBranches, parseGoogleRoute, parseLatLng, planSubwayTrip, routeMapHref, tRoutesInTrip, type RideLeg, type TripPlan } from "@/features/directions";

const net = buildNetwork(getStations(), getLines());
const rides = (p: TripPlan | null) => (p?.legs ?? []).filter((l): l is RideLeg => l.kind === "ride");

const HARVARD_SQ = { lat: 42.3736, lng: -71.1189 };
const CHINATOWN = { lat: 42.3505, lng: -71.0621, name: "Dumpling place" };
const AIRPORT = { lat: 42.3743, lng: -71.0304 };
const COPLEY = { lat: 42.35, lng: -71.0775, name: "Copley spot" };
const DAVIS = { lat: 42.3967, lng: -71.1218 };
const QUINCY_CENTER = { lat: 42.2516, lng: -71.0054, name: "Quincy spot" };

describe("offline subway planner", () => {
  it("splits the Red Line's Braintree branch off at JFK/UMass", () => {
    const red = getLines().find((l) => l.id === "Red")!;
    const [ashmont, braintree] = lineBranches(red);
    expect(ashmont.at(-1)).toBe("place-asmnl");
    expect(braintree).toContain("place-jfk");
    expect(braintree).not.toContain("place-asmnl");
    expect(braintree.indexOf("place-nqncy")).toBe(braintree.indexOf("place-jfk") + 1);
  });

  it("rides the Red Line from Harvard into downtown", () => {
    const p = planSubwayTrip(net, HARVARD_SQ, CHINATOWN);
    expect(p?.source).toBe("offline");
    const r = rides(p);
    expect(r[0]).toMatchObject({ line: "Red Line", short: "Red", from: { name: "Harvard" }, headsign: "Ashmont/Braintree" });
    expect(p!.legs[0]).toMatchObject({ kind: "walk", to: "Harvard" });
    expect(p!.legs.at(-1)).toMatchObject({ kind: "walk", to: "Dumpling place" });
    expect(p!.minutes).toBeGreaterThan(15);
    expect(p!.minutes).toBeLessThan(45);
  });

  it("changes lines when it has to, and any Green train works on the trunk", () => {
    const r = rides(planSubwayTrip(net, AIRPORT, COPLEY));
    expect(r.map((x) => x.short)).toEqual(["Blue", "Green"]);
    expect(r[1].line).toMatch(/^Green Line [BCDE/]+$/);
    expect(r[1].headsign).toMatch(/^any /);
  });

  it("takes the Braintree branch to Quincy, never via Ashmont", () => {
    const r = rides(planSubwayTrip(net, DAVIS, QUINCY_CENTER));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ short: "Red", to: { name: "Quincy Center" }, headsign: "Braintree" });
  });

  it("just walks when the place is close", () => {
    const p = planSubwayTrip(net, { lat: 42.3555, lng: -71.0605 }, { lat: 42.352, lng: -71.062 });
    expect(p?.legs).toEqual([expect.objectContaining({ kind: "walk" })]);
  });

  it("gives up outside the T (the UI offers Google Maps)", () => {
    expect(planSubwayTrip(net, { lat: 42.2626, lng: -71.8023 }, CHINATOWN)).toBeNull(); // Worcester
  });

  it("draws every ride along the line's real shape, in its color", () => {
    const p = planSubwayTrip(net, HARVARD_SQ, CHINATOWN)!;
    const ride = p.path.find((x) => !x.walk)!;
    expect(ride.color.toUpperCase()).toBe("#DA291C");
    expect(ride.points.length).toBeGreaterThan(5);
  });
});

describe("Google transit response", () => {
  // Shape per the Routes API computeRoutes docs; trimmed to the fields we ask for.
  const body = {
    routes: [
      {
        duration: "1680s",
        legs: [
          {
            steps: [
              { travelMode: "WALK", staticDuration: "120s", distanceMeters: 150, polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" } },
              { travelMode: "WALK", staticDuration: "60s", distanceMeters: 70 },
              {
                travelMode: "TRANSIT",
                staticDuration: "600s",
                polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
                transitDetails: {
                  stopDetails: {
                    departureStop: { name: "Harvard Square @ Garden St", location: { latLng: { latitude: 42.3743, longitude: -71.1196 } } },
                    arrivalStop: { name: "Central Square", location: { latLng: { latitude: 42.3651, longitude: -71.1038 } } },
                    departureTime: "2026-11-21T23:42:00Z",
                  },
                  headsign: "Nubian Station",
                  stopCount: 6,
                  transitLine: { name: "Harvard Square - Nubian Station", nameShort: "1", vehicle: { type: "BUS" } },
                },
              },
              { travelMode: "WALK", staticDuration: "300s", distanceMeters: 400 },
            ],
          },
        ],
      },
    ],
  };

  it("maps a bus trip: merged walks, the bus leg, walk to the place", () => {
    const p = parseGoogleRoute(body, { lat: 42.36, lng: -71.1, name: "Taqueria" })!;
    expect(p.source).toBe("google");
    expect(p.minutes).toBe(28);
    expect(p.legs).toHaveLength(3);
    expect(p.legs[0]).toEqual({ kind: "walk", minutes: 3, meters: 220, to: "Harvard Square @ Garden St" });
    expect(p.legs[1]).toMatchObject({ kind: "ride", mode: "bus", line: "Bus 1", short: "1", color: "#FFC72C", stops: 6, minutes: 10, headsign: "Nubian Station", departs: "2026-11-21T23:42:00Z" });
    expect(p.legs[2]).toMatchObject({ kind: "walk", to: "Taqueria" });
    expect(p.path.some((x) => !x.walk && x.color === "#FFC72C")).toBe(true);
  });

  it("returns null for an empty or unexpected response", () => {
    expect(parseGoogleRoute({}, CHINATOWN)).toBeNull();
    expect(parseGoogleRoute({ routes: [] }, CHINATOWN)).toBeNull();
    expect(parseGoogleRoute("nope", CHINATOWN)).toBeNull();
  });
});

describe("which T lines a trip rides (to hide the rest on the map)", () => {
  const ids = getLines().map((l) => l.id);
  const ride = (line: string, short: string, mode: RideLeg["mode"] = "subway"): RideLeg => ({
    kind: "ride", mode, line, short, color: "#000000", from: { name: "a", lat: 0, lng: 0 }, to: { name: "b", lat: 0, lng: 0 }, stops: 1, minutes: 1,
  });
  const trip = (...legs: RideLeg[]): TripPlan => ({ source: "google", minutes: 10, legs, path: [] });
  const sorted = (s: Set<string>) => [...s].sort();

  it("our planner: Blue, then any Green branch on the trunk", () => {
    expect(sorted(tRoutesInTrip(planSubwayTrip(net, AIRPORT, COPLEY)!, ids))).toEqual(["Blue", "Green-B", "Green-C", "Green-D", "Green-E"]);
  });

  it("Google's names: Red Line, a lettered Green branch, Mattapan", () => {
    expect(sorted(tRoutesInTrip(trip(ride("Red Line", "Red")), ids))).toEqual(["Red"]);
    expect(sorted(tRoutesInTrip(trip(ride("Green Line", "C", "light_rail")), ids))).toEqual(["Green-C"]);
    expect(sorted(tRoutesInTrip(trip(ride("Green Line", "Green", "light_rail")), ids))).toEqual(["Green-B", "Green-C", "Green-D", "Green-E"]);
    expect(sorted(tRoutesInTrip(trip(ride("Mattapan Trolley", "M", "light_rail")), ids))).toEqual(["Mattapan"]);
  });

  it("a bus-only trip rides no T line, so the map hides them all", () => {
    expect(tRoutesInTrip(trip(ride("Bus 66", "66", "bus")), ids).size).toBe(0);
    expect(tRoutesInTrip(trip(ride("Bus 66", "66", "bus"), ride("Orange Line", "Orange")), ids)).toEqual(new Set(["Orange"]));
  });
});

describe("links", () => {
  it("builds the T map link only when the place has coordinates", () => {
    expect(routeMapHref({ lat: 42.3505, lng: -71.0621, name: "Gene's" })).toBe("/map?to=42.350500%2C-71.062100&name=Gene%27s");
    expect(routeMapHref({ lat: null, lng: null, name: "x" })).toBeNull();
    expect(routeMapHref({ name: "x" })).toBeNull();
  });

  it("parses lat,lng and rejects junk", () => {
    expect(parseLatLng("42.3505,-71.0621")).toEqual({ lat: 42.3505, lng: -71.0621 });
    expect(parseLatLng(" 42.35 , -71.06 ")).toEqual({ lat: 42.35, lng: -71.06 });
    for (const bad of ["", "abc", "42.35", "95,10", "42,-200", undefined, null]) expect(parseLatLng(bad)).toBeNull();
  });

  it("Google Maps link: transit, with or without a starting point", () => {
    expect(googleMapsDirectionsUrl(CHINATOWN)).toBe("https://www.google.com/maps/dir/?api=1&destination=42.3505%2C-71.0621&travelmode=transit");
    expect(googleMapsDirectionsUrl(CHINATOWN, HARVARD_SQ)).toContain("origin=42.3736%2C-71.1189");
  });
});
