import { describe, expect, it } from "vitest";
import { placeChosen } from "../tripMapAccess";

describe("Trip Map unlock", () => {
  it("is locked until the group has a place to eat", () => {
    expect(placeChosen(null, null)).toBe(false);
    expect(placeChosen({ picks: [] }, null)).toBe(false);
  });

  it("unlocks with the group's picks, or a trip already heading to a place", () => {
    expect(placeChosen({ picks: [{ id: "p1" }] }, null)).toBe(true);
    expect(placeChosen(null, { id: "p1", name: "Dumpling Cafe", lat: 42.35, lng: -71.06 })).toBe(true);
  });
});
