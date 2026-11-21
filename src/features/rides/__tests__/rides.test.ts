import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import { createGuest } from "@/features/auth";
import { matchPing, matchRadius, RIDE_RULES } from "@/features/rides/match";
import { checkRideForReward, listRides, recordPing, RIDE_IDLE_MS } from "@/features/rides";
import { getLiveTransitVehicles, modeForRoute, resetLiveTransitCache, routeName, type LiveVehicle } from "@/lib/mbta/liveVehicles";

const db = createTestDb();
afterAll(() => db.$disconnect());

const T0 = new Date("2026-11-21T23:00:00Z");
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);
/** ~111 m per 0.001 deg of latitude. */
const north = (lat: number, meters: number) => lat + meters / 111_320;

// Bus 1 going north along Mass Ave from Central Square.
const START = { lat: 42.3655, lng: -71.1038 };
const bus = (id: string, metersNorth: number, updatedSec: number, routeId = "1"): LiveVehicle => ({
  id,
  routeId,
  mode: modeForRoute(routeId)!,
  lat: north(START.lat, metersNorth),
  lng: START.lng,
  updatedAt: at(updatedSec),
});
const deps = (vehicles: LiveVehicle[], sec: number) => ({ vehicles, routeName: async (id: string) => (id === "1" ? "Bus 1" : id), now: at(sec) });
const me = (metersNorth: number, accuracyM = 10) => ({ lat: north(START.lat, metersNorth), lng: START.lng, accuracyM });
const newUser = async () => (await createGuest(db)).id;

describe("matching a ping to a live vehicle", () => {
  it("matches the vehicle you're on and picks the closest", () => {
    const m = matchPing(me(0), [bus("far", 400, 0), bus("near", 20, 0)], at(5));
    expect(m?.vehicle.id).toBe("near");
  });

  it("allows for MBTA position lag, but ignores positions that are too old", () => {
    // vehicle reported 30 s ago, now ~250 m behind where it really is (and where you are)
    expect(matchPing(me(250), [bus("v", 0, 0)], at(30))).not.toBeNull();
    expect(matchPing(me(0), [bus("v", 0, 0)], at(RIDE_RULES.maxVehicleAgeSec + 1))).toBeNull();
    expect(matchRadius(10, 0)).toBeLessThan(matchRadius(10, 30));
  });

  it("ignores phones with poor accuracy (indoors, underground guesses)", () => {
    expect(matchPing(me(0, RIDE_RULES.maxPhoneAccuracyM + 1), [bus("v", 0, 0)], at(5))).toBeNull();
  });
});

describe("recording a ride", () => {
  it("verifies a real bus ride: same vehicle, a few minutes, ~1 km", async () => {
    const u = await newUser();
    let r = await recordPing(db, u, me(0), deps([bus("y1", 10, 0)], 2));
    expect(r).toMatchObject({ status: "tracking", mode: "bus", routeName: "Bus 1", matchedPings: 1 });
    r = await recordPing(db, u, me(500), deps([bus("y1", 510, 60)], 62), r.id);
    // 2 matches on the same bus, 60 s and 500 m apart, ~8 m/s: verified
    expect(r).toMatchObject({ status: "verified", matchedPings: 2, mode: "bus" });
    expect(r.distanceM).toBeGreaterThan(450);
    // still on the bus: the verified ride keeps following you (to know where you got off)
    r = await recordPing(db, u, me(1100), deps([bus("y1", 1090, 150)], 152), r.id);
    expect(r).toMatchObject({ status: "verified", matchedPings: 3, onVehicle: true });
    expect(r.distanceM).toBeGreaterThan(1050);
    // got off: the bus is gone, you aren't on it; the ride stays verified and ends where it was
    r = await recordPing(db, u, me(1150), deps([bus("y1", 1900, 210)], 212), r.id);
    expect(r).toMatchObject({ status: "verified", matchedPings: 3, onVehicle: false });
    const row = await db.ride.findUniqueOrThrow({ where: { id: r.id! } });
    expect(row.endLat).toBeCloseTo(north(START.lat, 1100), 3);
  });

  it("picks the bus you're really on when several are bunched together (Silver Line, Green Line trunk)", async () => {
    // At the stop an SL4 is closer than your SL3. Both leave; the SL4 falls behind.
    const u = await newUser();
    const sl3 = (m: number, s: number) => bus("y-sl3", m, s, "743");
    const sl4 = (m: number, s: number) => bus("y-sl4", m, s, "751");
    const names = async (id: string) => (id === "743" ? "SL3" : "SL4");
    const d = (vs: LiveVehicle[], s: number) => ({ vehicles: vs, routeName: names, now: at(s) });
    let r = await recordPing(db, u, me(0), d([sl4(5, 0), sl3(40, 0)], 0));
    expect(r.routeName).toBe("SL4"); // closest, for now
    r = await recordPing(db, u, me(200), d([sl3(200, 40), sl4(120, 40)], 40), r.id); // both still within range
    r = await recordPing(db, u, me(450), d([sl3(450, 80), sl4(180, 80)], 80), r.id); // SL4 is now far behind
    expect(r.routeName).toBe("SL3");
    r = await recordPing(db, u, me(700), d([sl3(700, 120), sl4(260, 120)], 120), r.id);
    expect(r).toMatchObject({ status: "verified", routeName: "SL3", mode: "bus", onVehicle: true });
  });

  it("two trains together the whole way: the one that stays closest to you wins", async () => {
    // Like two Green Line C trains a block apart: both match every ping.
    const u = await newUser();
    const mine = (m: number, s: number) => bus("G-mine", m, s, "Green-C");
    const behind = (m: number, s: number) => bus("G-behind", m - 120, s, "Green-C");
    const d = (vs: LiveVehicle[], s: number) => ({ vehicles: vs, routeName: async () => "Green Line C", now: at(s) });
    let r = await recordPing(db, u, me(0), d([behind(0, 0), mine(0, 0)], 0));
    for (let i = 1; i <= 3; i++) r = await recordPing(db, u, me(i * 200), d([behind(i * 200, i * 40), mine(i * 200, i * 40)], i * 40), r.id);
    const row = await db.ride.findUniqueOrThrow({ where: { id: r.id! } });
    expect(row.vehicleId).toBe("G-mine");
    expect(r).toMatchObject({ status: "verified", mode: "t" });
  });

  it("stores nothing for a ping that isn't on any bus or train (walking, at home)", async () => {
    const u = await newUser();
    const r = await recordPing(db, u, me(0), deps([bus("far", 2000, 0)], 5));
    expect(r).toMatchObject({ id: null, status: "none", onVehicle: false });
    expect(await db.ride.count({ where: { userId: u } })).toBe(0);
  });

  it("verifies a slow bus in traffic (walking pace) by staying with it longer", async () => {
    // Like a real Bus 41 on a Saturday: ~1.8 m/s with stops. One ping every 45 s.
    const u = await newUser();
    let r = await recordPing(db, u, me(0), deps([bus("slow", 0, 0)], 0));
    for (let i = 1; i <= 3; i++) {
      r = await recordPing(db, u, me(i * 80), deps([bus("slow", i * 80, i * 45)], i * 45), r.id!);
      expect(r.status).toBe("tracking"); // too slow for the fast rule, not enough matches yet
    }
    expect(r.message).toMatch(/move/); // 240 m so far, under the 300 m minimum
    r = await recordPing(db, u, me(320), deps([bus("slow", 320, 180)], 180), r.id!); // 5 matches, 3 min, 320 m
    expect(r).toMatchObject({ status: "verified", mode: "bus" });
  });

  it("still doesn't verify standing still next to a bus stuck in traffic", async () => {
    const u = await newUser();
    let r = await recordPing(db, u, me(0), deps([bus("stuck", 0, 0)], 0));
    for (let i = 1; i <= 6; i++) r = await recordPing(db, u, me(0), deps([bus("stuck", 20, i * 45)], i * 45), r.id!);
    expect(r.status).toBe("tracking"); // never moved 300 m
  });

  it("does NOT verify someone standing at a stop while a bus goes by", async () => {
    const u = await newUser();
    let r = await recordPing(db, u, me(0), deps([bus("y2", 5, 0)], 1)); // bus at the stop: match
    r = await recordPing(db, u, me(0), deps([bus("y2", 600, 60)], 62), r.id); // bus left, you didn't
    r = await recordPing(db, u, me(0), deps([bus("y2", 1200, 120)], 122), r.id);
    expect(r.status).toBe("tracking");
    expect(r.matchedPings).toBe(1);
  });

  it("does NOT verify walking next to a bus route (too slow), even if buses keep passing", async () => {
    const u = await newUser();
    // You walk 1.2 m/s; a different bus happens to pass you each time.
    let r = await recordPing(db, u, me(0), deps([bus("a", 0, 0)], 0));
    r = await recordPing(db, u, me(150), deps([bus("a", 900, 120), bus("b", 150, 120)], 120), r.id); // switches to b (only 1 match so far)
    r = await recordPing(db, u, me(300), deps([bus("b", 1500, 240), bus("c", 300, 240)], 240), r.id);
    expect(r.status).toBe("tracking");
  });

  it("requires 60+ seconds and 300+ meters on the same vehicle", async () => {
    const u = await newUser();
    let r = await recordPing(db, u, me(0), deps([bus("y3", 0, 0)], 0));
    r = await recordPing(db, u, me(400), deps([bus("y3", 400, 30)], 30), r.id); // 400 m but only 30 s
    expect(r.status).toBe("tracking");
    r = await recordPing(db, u, me(900), deps([bus("y3", 900, 75)], 75), r.id); // now 75 s, 900 m
    expect(r.status).toBe("verified");
  });

  it("works for the T too (mode from the route id)", async () => {
    const u = await newUser();
    let r = await recordPing(db, u, me(0), deps([bus("R-1", 0, 0, "Red")], 0));
    r = await recordPing(db, u, me(1500), deps([bus("R-1", 1500, 120, "Red")], 120), r.id);
    expect(r).toMatchObject({ status: "verified", mode: "t" });
  });

  it("an idle ride is dropped; the next ping starts fresh", async () => {
    const u = await newUser();
    const first = await recordPing(db, u, me(0), deps([bus("y4", 0, 0)], 0));
    const later = (RIDE_IDLE_MS + 60_000) / 1000;
    const next = await recordPing(db, u, me(0), deps([bus("y5", 0, later)], later));
    expect(next.id).not.toBe(first.id);
    expect(next.matchedPings).toBe(1);
  });

  it("stores only coarse start/end points, not every ping", async () => {
    const u = await newUser();
    let r = await recordPing(db, u, { lat: 42.365512345, lng: -71.103812345, accuracyM: 5 }, deps([bus("y6", 0, 0)], 0));
    r = await recordPing(db, u, me(800), deps([bus("y6", 800, 90)], 90), r.id);
    const row = await db.ride.findUniqueOrThrow({ where: { id: r.id! } });
    expect(row.startLat).toBe(42.3655);
    expect(row.startLng).toBe(-71.1038);
    expect(await db.ride.count({ where: { userId: u } })).toBe(1);
    expect((await listRides(db, u, at(100))).map((x) => x.status)).toEqual(["verified"]);
  });
});

describe("using a ride for a reward", () => {
  async function verified(u: string) {
    let r = await recordPing(db, u, me(0), deps([bus("z", 0, 0)], 0));
    r = await recordPing(db, u, me(1000), deps([bus("z", 1000, 120)], 120), r.id);
    return r.id!;
  }
  const endPoint = { lat: north(START.lat, 1000), lng: START.lng };

  it("accepts your own recent verified ride that ended near the place", async () => {
    const u = await newUser();
    const id = await verified(u);
    expect(await checkRideForReward(db, u, id, { now: at(600), place: endPoint })).toEqual({ ride: { id, mode: "bus", routeName: "Bus 1" } });
  });

  it("explains why a ride can't be used", async () => {
    const u = await newUser();
    const id = await verified(u);
    expect(await checkRideForReward(db, await newUser(), id, { now: at(600) })).toEqual({ reason: expect.stringMatching(/couldn't find/) });
    expect(await checkRideForReward(db, u, id, { now: at(5 * 3600) })).toEqual({ reason: expect.stringMatching(/too long ago/) });
    expect(await checkRideForReward(db, u, id, { now: at(600), place: { lat: 42.2, lng: -71.0 } })).toEqual({ reason: expect.stringMatching(/km from this restaurant/) });
  });
});

describe("MBTA live vehicles feed", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    resetLiveTransitCache();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("knows bus vs T from route ids", () => {
    expect(["Red", "Green-B", "Mattapan", "CR-Fitchburg"].map(modeForRoute)).toEqual(["t", "t", "t", "t"]);
    expect(["1", "741", "Shuttle-Generic-Red"].map(modeForRoute)).toEqual(["bus", "bus", "bus"]);
    expect(modeForRoute("Boat-F1")).toBeNull();
  });

  it("asks MBTA for buses and trains, maps them, and caches for 10 s", async () => {
    const vehicle = (id: string, route: string) => ({
      id,
      type: "vehicle",
      attributes: { latitude: 42.36, longitude: -71.1, updated_at: "2026-11-21T18:00:00-05:00" },
      relationships: { route: { data: { id: route, type: "route" } } },
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [vehicle("y1", "1"), vehicle("R-1", "Red"), vehicle("f", "Boat-F1")] })));
    const vs = await getLiveTransitVehicles();
    expect(vs.map((v) => [v.id, v.mode])).toEqual([["y1", "bus"], ["R-1", "t"]]); // ferry dropped
    expect(String(fetchMock.mock.calls[0][0])).toContain("filter%5Broute_type%5D=0%2C1%2C2%2C3");
    await getLiveTransitVehicles();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when MBTA is down and there's nothing recent to fall back on", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(getLiveTransitVehicles()).rejects.toThrow();
  });

  it("names routes the way riders say them", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [
        { id: "1", type: "route", attributes: { type: 3, short_name: "1", long_name: "Harvard Square - Nubian Station" } },
        { id: "741", type: "route", attributes: { type: 3, short_name: "SL1", long_name: "Logan Airport - South Station" } },
        { id: "Red", type: "route", attributes: { type: 1, short_name: "", long_name: "Red Line" } },
      ] })),
    );
    expect(await routeName("1")).toBe("Bus 1");
    expect(await routeName("741")).toBe("SL1");
    expect(await routeName("Red")).toBe("Red Line");
    expect(await routeName("Shuttle-Generic-Red")).toBe("Shuttle bus");
  });
});
