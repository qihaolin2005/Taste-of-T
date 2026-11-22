import { describe, expect, it } from "vitest";
import { adventureDestination, CREW_COLORS, crewKey, toCrew } from "../adventure";

type Leg = { mode: "walk" | "transit"; path: [number, number][]; distanceM: number };
const trip = (id: string, extra: { isYou?: boolean; name?: string | null; status?: "recording" | "finished"; arrived?: boolean; legs?: Leg[] } = {}) => ({
  id,
  isYou: false,
  name: null,
  status: "recording" as const,
  arrived: false,
  legs: [] as Leg[],
  ...extra,
});

describe("adventure view on the T map", () => {
  it("draws each person's path in their own color, and puts their dot where the path ends", () => {
    const crew = toCrew([
      trip("a", {
        isYou: true,
        legs: [
          { mode: "walk", path: [[42.35, -71.06], [42.351, -71.061]], distanceM: 120 },
          { mode: "transit", path: [[42.351, -71.061], [42.36, -71.07]], distanceM: 1400 },
        ],
      }),
      trip("b", { name: "Maya", status: "finished", arrived: true, legs: [{ mode: "walk", path: [[42.34, -71.05]], distanceM: 0 }] }),
    ]);
    expect(crew[0]).toMatchObject({ label: "You", you: true, color: CREW_COLORS[0], live: true, at: { lat: 42.36, lng: -71.07 } });
    expect(crew[0].legs.map((l) => l.transit)).toEqual([false, true]);
    expect(crew[1]).toMatchObject({ label: "Maya", you: false, color: CREW_COLORS[1], live: false, arrived: true, at: { lat: 42.34, lng: -71.05 } });
  });

  it("someone who just started (no GPS fix yet) has no dot, and colors wrap for big groups", () => {
    expect(toCrew([trip("a")])[0].at).toBeNull();
    const big = toCrew(Array.from({ length: CREW_COLORS.length + 1 }, (_, i) => trip(`t${i}`)));
    expect(big.at(-1)!.color).toBe(CREW_COLORS[0]);
  });

  it("goes where the group's trips are heading, else the group's top pick", () => {
    const picks = [{ place: { id: "no-coords", name: "?" } }, { place: { id: "p1", name: "Lantern Dumpling House", lat: 42.35, lng: -71.06 } }];
    expect(adventureDestination({ id: "t", name: "Trip Place", lat: 1, lng: 2 }, picks)).toEqual({ id: "t", name: "Trip Place", lat: 1, lng: 2 });
    expect(adventureDestination(null, picks)).toEqual({ id: "p1", name: "Lantern Dumpling House", lat: 42.35, lng: -71.06 });
    expect(adventureDestination(null, [])).toBeNull();
  });

  it("re-frames the map when someone joins, not on every live update", () => {
    const one = toCrew([trip("a", { legs: [{ mode: "walk", path: [[42.35, -71.06]], distanceM: 0 }] })]);
    const moved = toCrew([trip("a", { legs: [{ mode: "walk", path: [[42.35, -71.06], [42.36, -71.07]], distanceM: 900 }] })]);
    const two = toCrew([trip("a"), trip("b")]);
    const dest = { lat: 42.35, lng: -71.06 };
    expect(crewKey(moved, dest)).toBe(crewKey(one, dest));
    expect(crewKey(two, dest)).not.toBe(crewKey(one, dest));
    expect(crewKey(one, { lat: 1, lng: 2 })).not.toBe(crewKey(one, dest));
  });
});
