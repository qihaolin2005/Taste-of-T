import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createGuest } from "@/features/auth";
import { createRoom, createRoomSchema, joinRoom, leaveRoom, memberInputSchema } from "@/features/rooms";
import {
  addPoints,
  appendFixes,
  deleteTrip,
  finishTrip,
  getTrip,
  hideStart,
  listMyTrips,
  listRoomTrips,
  splitLegs,
  startTrip,
  TRIP_IDLE_MS,
  TRIP_RULES,
  type StoredPoint,
} from "@/features/trips";

const db = createTestDb();
afterAll(() => db.$disconnect());

const T0 = new Date("2026-11-21T23:00:00Z");
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);
const START = { lat: 42.3655, lng: -71.1038 }; // Central Square
const north = (meters: number) => START.lat + meters / 111_320;
/** A fix `meters` north of START at `sec` seconds into the trip. */
const fix = (meters: number, sec: number, accuracyM = 8) => ({ lat: north(meters), lng: START.lng, t: at(sec).getTime(), accuracyM });
/** Walk at 1.3 m/s for `sec` seconds, one fix every 10 s, starting at `fromM`/`fromSec`. */
const walk = (fromM: number, fromSec: number, sec: number) => Array.from({ length: sec / 10 }, (_, i) => fix(fromM + (i + 1) * 13, fromSec + (i + 1) * 10));
/** Ride a bus at 9 m/s. */
const bus = (fromM: number, fromSec: number, sec: number) => Array.from({ length: sec / 15 }, (_, i) => fix(fromM + (i + 1) * 135, fromSec + (i + 1) * 15));

const newUser = async () => (await createGuest(db)).id;
const night = createRoomSchema.parse({ name: "Friday crew", day: "tonight", startTime: 1140, slots: ["dinner"] });
const member = (name: string) => memberInputSchema.parse({ name, startStationId: "place-chncl", homeStationId: "place-harsq", budget: 30 });
const DEST = { id: "seed-dumplings", name: "Lantern Dumpling House", lat: north(2400), lng: START.lng };

describe("cleaning a GPS path", () => {
  const sp = (m: number, t: number): StoredPoint => [north(m), START.lng, t];

  it("drops jitter, inaccurate fixes, impossible jumps and out-of-order fixes", () => {
    const { points, addedM } = appendFixes(
      [sp(0, 0)],
      [
        { lat: north(3), lng: START.lng, t: 5 }, // 3 m: standing still
        { lat: north(50), lng: START.lng, t: 30, accuracyM: TRIP_RULES.maxAccuracyM + 1 }, // a guess
        { lat: north(5000), lng: START.lng, t: 40 }, // 5 km in 40 s: glitch
        { lat: north(40), lng: START.lng, t: 30 }, // walked back 40 m: fine
        { lat: north(80), lng: START.lng, t: 20 }, // fixes are sorted by time first
      ],
    );
    expect(points.map((p) => p[2])).toEqual([0, 20, 30]);
    expect(addedM).toBeGreaterThan(110);
  });

  it("splits walking and bus legs by speed, ignoring short fast blips", () => {
    const walkPts = Array.from({ length: 20 }, (_, i) => sp(i * 13, i * 10)); // 0..247 m
    const busPts = Array.from({ length: 10 }, (_, i) => sp(247 + (i + 1) * 135, 190 + (i + 1) * 15)); // +1350 m
    const legs = splitLegs([...walkPts, ...busPts, sp(247 + 1350 + 13, 350)]);
    expect(legs.map((l) => l.mode)).toEqual(["walk", "transit", "walk"]);
    expect(legs[1].distanceM).toBeGreaterThan(1300);
    // legs share their boundary point, so the line is continuous
    expect(legs[0].path.at(-1)).toEqual(legs[1].path[0]);

    // one fast step of 100 m (a GPS jump) is not a bus ride
    expect(splitLegs([sp(0, 0), sp(13, 10), sp(113, 20), sp(126, 30)]).map((l) => l.mode)).toEqual(["walk"]);
  });

  it("a verified ride makes a leg a bus/T leg even at walking pace (slow bus in traffic)", () => {
    // 1.5 m/s the whole way: speed alone would say "walked"
    const pts = Array.from({ length: 31 }, (_, i) => sp(i * 15, i * 10)); // 0..300 s
    expect(splitLegs(pts).map((l) => l.mode)).toEqual(["walk"]);
    const legs = splitLegs(pts, [{ fromSec: 90, toSec: 210, mode: "bus", routeName: "Bus 41" }]);
    expect(legs.map((l) => [l.mode, l.ride?.routeName ?? null])).toEqual([
      ["walk", null],
      ["transit", "Bus 41"],
      ["walk", null],
    ]);
    // boarding/alighting allowance: ~30 s each side of the first/last match
    expect(legs[1].distanceM).toBeGreaterThan(15 * 17);
  });

  it("names back-to-back rides separately (a transfer)", () => {
    const pts = Array.from({ length: 41 }, (_, i) => sp(i * 60, i * 10)); // 6 m/s throughout
    const legs = splitLegs(pts, [
      { fromSec: 0, toSec: 150, mode: "bus", routeName: "Bus 1" },
      { fromSec: 250, toSec: 400, mode: "t", routeName: "Red Line" },
    ]);
    expect(legs.filter((l) => l.ride).map((l) => l.ride!.routeName)).toEqual(["Bus 1", "Red Line"]);
  });

  it("counts a jump after an underground gap as transit when the speed says so", () => {
    // no fixes for 4 minutes underground, then 2 km away
    expect(splitLegs([[START.lat, START.lng, 0], [north(13), START.lng, 10], [north(2013), START.lng, 250]]).map((l) => l.mode)).toEqual(["walk", "transit"]);
  });

  it("hides the start of the path (privacy zone)", () => {
    const pts = Array.from({ length: 40 }, (_, i) => sp(i * 13, i * 10));
    const hidden = hideStart(pts, 200);
    expect(hidden.length).toBeLessThan(pts.length);
    expect(hidden[0][0]).toBeGreaterThan(north(200));
  });
});

describe("recording a trip", () => {
  it("records walk + bus + walk to the restaurant and finishes on arrival", async () => {
    const u = await newUser();
    let trip = await startTrip(db, u, { place: DEST }, T0);
    expect(trip).toMatchObject({ status: "recording", distanceM: 0, place: { name: "Lantern Dumpling House" } });

    trip = await addPoints(db, u, trip.id, [fix(0, 0), ...walk(0, 0, 200)], at(200)); // 260 m
    trip = await addPoints(db, u, trip.id, bus(260, 200, 225), at(425)); // +2025 m
    expect(trip.status).toBe("recording");
    trip = await addPoints(db, u, trip.id, [fix(2400, 460)], at(460)); // at the door
    expect(trip).toMatchObject({ status: "finished", arrived: true });
    expect(trip.distanceM).toBeGreaterThan(2300);
    expect(trip.legs.map((l) => l.mode)).toEqual(["walk", "transit", "walk"]);
    expect(trip.transitM).toBeGreaterThan(2000);
    expect(trip.durationSec).toBe(460);

    await expect(addPoints(db, u, trip.id, [fix(2500, 500)], at(500))).rejects.toThrow(/already ended/);
  });

  it("lists verified MBTA rides taken during the trip", async () => {
    const u = await newUser();
    const trip = await startTrip(db, u, {}, T0);
    await db.ride.create({ data: { userId: u, status: "verified", mode: "bus", routeName: "Bus 1", firstMatchAt: at(120), lastMatchAt: at(300), verifiedAt: at(200) } });
    await db.ride.create({ data: { userId: u, status: "verified", mode: "t", routeName: "Red Line", firstMatchAt: at(-3600), lastMatchAt: at(-3000) } }); // before the trip
    const done = await finishTrip(db, u, trip.id, at(600));
    expect(done.rides).toEqual([{ mode: "bus", routeName: "Bus 1" }]);
  });

  it("starting a new trip ends the old one; idle trips finish on their own", async () => {
    const u = await newUser();
    const a = await startTrip(db, u, {}, T0);
    await addPoints(db, u, a.id, [fix(0, 0), fix(100, 60)], at(60));
    const b = await startTrip(db, u, {}, at(120));
    expect((await getTrip(db, u, a.id, at(120))).status).toBe("finished");

    const later = new Date(at(120).getTime() + TRIP_IDLE_MS + 60_000);
    const [latest] = await listMyTrips(db, u, later);
    expect(latest).toMatchObject({ id: b.id, status: "finished" });
  });

  it("only you can add to, see, or delete your solo trip", async () => {
    const u = await newUser();
    const other = await newUser();
    const trip = await startTrip(db, u, {}, T0);
    await expect(addPoints(db, other, trip.id, [fix(0, 0)], at(1))).rejects.toThrow(/not found/);
    await expect(getTrip(db, other, trip.id, at(1))).rejects.toThrow(/not found/);
    await expect(deleteTrip(db, other, trip.id)).rejects.toThrow(/not found/);
    await deleteTrip(db, u, trip.id);
    expect(await db.trip.count({ where: { id: trip.id } })).toBe(0);
  });
});

describe("group trip map", () => {
  async function group() {
    const host = await newUser();
    const code = await createRoom(db, host, night, T0);
    await joinRoom(db, code, host, member("Ana"), T0);
    const friend = await newUser();
    await joinRoom(db, code, friend, member("Ben"), T0);
    return { code, host, friend };
  }

  it("shows everyone's path, hiding the start of other people's", async () => {
    const { code, host, friend } = await group();
    const a = await startTrip(db, host, { roomId: code.toLowerCase(), place: DEST }, T0);
    await addPoints(db, host, a.id, [fix(0, 0), ...walk(0, 0, 300)], at(300)); // 390 m walk
    const b = await startTrip(db, friend, { roomId: code, place: DEST }, T0);
    await addPoints(db, friend, b.id, [fix(0, 0), ...bus(0, 0, 150)], at(150));

    const view = await listRoomTrips(db, host, code, at(320));
    expect(view.roomId).toBe(code);
    expect(view.destination?.name).toBe("Lantern Dumpling House");
    expect(view.trips.map((t) => [t.name, t.isYou])).toEqual([
      ["Ana", true],
      ["Ben", false],
    ]);
    const [mine, bens] = view.trips;
    // your own path starts where you started; Ben's starts 200+ m away from his start
    expect(mine.legs[0].path[0][0]).toBeCloseTo(START.lat, 4);
    expect(mine.startHidden).toBe(false);
    expect(bens.startHidden).toBe(true);
    expect(bens.legs[0].path[0][0]).toBeGreaterThan(north(TRIP_RULES.privacyRadiusM));
    // ...but his totals are for the whole trip
    expect(bens.distanceM).toBeGreaterThan(1300);
  });

  it("is only for members, and people who leave drop off the map", async () => {
    const { code, host, friend } = await group();
    const stranger = await newUser();
    await expect(listRoomTrips(db, stranger, code, at(1))).rejects.toThrow(/not in it/);
    await expect(startTrip(db, stranger, { roomId: code }, at(1))).rejects.toThrow(/not in it/);

    const b = await startTrip(db, friend, { roomId: code }, T0);
    await expect(getTrip(db, stranger, b.id, at(1))).rejects.toThrow(/not found/);
    expect((await getTrip(db, host, b.id, at(1))).name).toBe("Ben");

    await leaveRoom(db, code, friend);
    expect((await listRoomTrips(db, host, code, at(2))).trips).toEqual([]);
    // the trip is still the friend's own
    expect((await listMyTrips(db, friend, at(2))).map((t) => t.id)).toEqual([b.id]);
  });

  it("disappears for the group when the group expires", async () => {
    const { code, host, friend } = await group();
    const b = await startTrip(db, friend, { roomId: code }, T0);
    const expired = new Date(T0.getTime() + 3 * 24 * 3600_000);
    await expect(listRoomTrips(db, host, code, expired)).rejects.toThrow(/not found/i);
    await expect(getTrip(db, host, b.id, expired)).rejects.toThrow(/not found/);
    expect((await getTrip(db, friend, b.id, expired)).id).toBe(b.id);
  });
});
