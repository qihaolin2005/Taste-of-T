// Demo trips: fills the local database with realistic recorded trips around Boston, through the
// same code that records real ones (startTrip / addPoints: fix filtering, walk vs T legs,
// arriving finishes the trip). Then reads them back the way My Trips and the group trip map do.
//
//   npm run demo:trips                       -> demo account demo@tasteoft.example / BostonDemo2026!
//   npm run demo:trips -- --email you@x.com  -> your own account instead (it must exist)
//
// Creates:
//   - a solo trip for you, yesterday: Davis Square -> Quincy Market, by Red Line
//   - group BEAN: you + 5 friends, each from a different neighborhood, all arriving at the same
//     Chinatown restaurant about 20 minutes ago (by Red / Orange / Green / Blue Line or on foot)
// Routes come from the subway planner (src/features/directions) along the real MBTA line shapes,
// turned into timed GPS fixes at walking and train speeds. Each T leg also gets a verified ride
// (vehicleId "demo") so the trip shows "Red Line" instead of just "transit".
// Running it again replaces the previous demo data. Local/demo databases only.
import "dotenv/config";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../src/generated/prisma/client";
import { distanceMeters, nearestStation, type LatLng } from "../src/lib/geo";
import { getLines, getStations } from "../src/lib/mbta/stations";
import { googlePlacesEnabled, searchTextNear } from "../src/lib/places";
import { signUp } from "../src/features/auth";
import { buildNetwork, planSubwayTrip, type RideLeg, type TripPlan } from "../src/features/directions";
import { createRoom, joinRoom } from "../src/features/rooms/roomStore";
import { addPoints, listMyTrips, listRoomTrips, startTrip, type TripPlace } from "../src/features/trips";

const DEMO_EMAIL = "demo@tasteoft.example";
const DEMO_PASSWORD = "BostonDemo2026!";
const FRIEND_DOMAIN = "@demo.tasteoft.example";
const ROOM_CODE = "BEAN"; // Beantown (codes have no I or O)
const DEMO_VEHICLE = "demo";

const db = new PrismaClient({ adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db", authToken: process.env.TURSO_AUTH_TOKEN }) });
const net = buildNetwork(getStations(), getLines());

// ------------------------------------------------------------- who, from where, to where

type Person = { name: string; from: LatLng; where: string };
const GROUP: Person[] = [
  { name: "You", from: { lat: 42.3736, lng: -71.1189 }, where: "Harvard Square" },
  { name: "Maya", from: { lat: 42.3398, lng: -71.0892 }, where: "Northeastern" },
  { name: "Leo", from: { lat: 42.3489, lng: -71.095 }, where: "Kenmore Square" },
  { name: "Priya", from: { lat: 42.3426, lng: -71.057 }, where: "South Boston (Broadway)" },
  { name: "Sam", from: { lat: 42.3632, lng: -71.0546 }, where: "North End" },
  { name: "Ava", from: { lat: 42.3747, lng: -71.0335 }, where: "East Boston (Airport)" },
];
const SOLO_FROM = { lat: 42.3967, lng: -71.1224 }; // Davis Square

/** A real Google place when there's a key (so photos and links work), else a fixed spot. */
async function findDestination(query: string, near: LatLng, fallback: TripPlace): Promise<TripPlace> {
  if (!googlePlacesEnabled()) return fallback;
  try {
    const [p] = await searchTextNear(near, query, 500);
    return p ? { id: p.id, name: p.name, lat: p.lat, lng: p.lng } : fallback;
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------- route -> timed GPS fixes

/** Repeatable "random" so every run makes the same paths. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

type Fix = LatLng & { t: number; accuracyM: number };
type RideRow = { leg: RideLeg; fromMs: number; toMs: number };

const WALK_MPS = 1.35;
const WAIT_MS = 3 * 60_000; // on the platform before each train

/** Points along a polyline every `stepM` meters. */
function along(path: readonly LatLng[], stepM: number): LatLng[] {
  const out: LatLng[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const n = Math.max(1, Math.round(distanceMeters(a, b) / stepM));
    for (let k = 1; k <= n; k++) out.push({ lat: a.lat + ((b.lat - a.lat) * k) / n, lng: a.lng + ((b.lng - a.lng) * k) / n });
  }
  return out;
}

/** The planned trip as the GPS fixes a phone would send, starting at `startMs`. */
function simulate(plan: TripPlan, startMs: number, seed: number): { fixes: Fix[]; rides: RideRow[]; endMs: number } {
  const rand = rng(seed);
  const fixes: Fix[] = [];
  const rides: RideRow[] = [];
  const rideLegs = plan.legs.filter((l): l is RideLeg => l.kind === "ride");
  let t = startMs;
  let r = 0;
  for (const seg of plan.path) {
    if (seg.walk) {
      // A fix about every 15 s at walking pace, with a few meters of GPS wobble.
      const pts = along(seg.points, WALK_MPS * 15);
      for (const [i, p] of pts.entries()) {
        if (i > 0) t += (distanceMeters(pts[i - 1], p) / WALK_MPS) * 1000;
        fixes.push({ lat: p.lat + (rand() - 0.5) * 4e-5, lng: p.lng + (rand() - 0.5) * 4e-5, t: Math.round(t), accuracyM: 6 + Math.round(rand() * 10) });
      }
    } else {
      const leg = rideLegs[r++];
      t += WAIT_MS;
      const lengthM = seg.points.reduce((m, p, i) => (i ? m + distanceMeters(seg.points[i - 1], p) : 0), 0);
      // Train speed from the planner's minutes, kept in a believable range (and over the 6 m/s
      // the recorder counts as transit).
      const mps = Math.min(14, Math.max(8, lengthM / Math.max(60, (leg?.minutes ?? 5) * 60)));
      const pts = along(seg.points, mps * 20);
      const from = t;
      for (const [i, p] of pts.entries()) {
        if (i > 0) t += (distanceMeters(pts[i - 1], p) / mps) * 1000;
        fixes.push({ lat: p.lat, lng: p.lng, t: Math.round(t), accuracyM: 12 + Math.round(rand() * 15) });
      }
      if (leg) rides.push({ leg, fromMs: from, toMs: t });
    }
  }
  return { fixes, rides, endMs: Math.round(t) };
}

/** Plan + simulate + record one trip through the real trip code. Returns the recorded trip id. */
async function recordTrip(opts: { userId: string; roomId?: string; place: TripPlace; from: LatLng; arriveAt?: number; startAt?: number; seed: number }) {
  const plan = planSubwayTrip(net, opts.from, { ...opts.place, name: opts.place.name ?? undefined });
  if (!plan) throw new Error(`No route from ${opts.from.lat},${opts.from.lng}`);
  // Dry run to learn the duration, so group trips can all arrive at about the same time.
  const dry = simulate(plan, 0, opts.seed);
  const start = opts.startAt ?? opts.arriveAt! - dry.endMs;
  const { fixes, rides, endMs } = simulate(plan, start, opts.seed);
  fixes.push({ ...opts.place, t: endMs + 20_000, accuracyM: 8 }); // at the door

  let trip = await startTrip(db, opts.userId, { roomId: opts.roomId, place: opts.place }, new Date(start));
  for (let i = 0; i < fixes.length; i += 150) {
    const batch = fixes.slice(i, i + 150);
    trip = await addPoints(db, opts.userId, trip.id, batch, new Date(batch.at(-1)!.t + 5000));
    if (trip.status === "finished") break;
  }
  // What the MBTA check leaves behind for a verified ride, so the legs are named.
  for (const { leg, fromMs, toMs } of rides) {
    await db.ride.create({
      data: {
        userId: opts.userId,
        status: "verified",
        mode: "t",
        routeId: leg.short,
        routeName: leg.line,
        vehicleId: DEMO_VEHICLE,
        matchedPings: Math.max(2, Math.round((toMs - fromMs) / 30_000)),
        firstMatchAt: new Date(fromMs + 30_000),
        lastMatchAt: new Date(toMs - 30_000),
        verifiedAt: new Date(fromMs + 90_000),
        lastPingAt: new Date(toMs),
        startLat: leg.from.lat,
        startLng: leg.from.lng,
        endLat: leg.to.lat,
        endLng: leg.to.lng,
        distanceM: Math.round(distanceMeters(leg.from, leg.to)),
      },
    });
  }
  return { id: trip.id, plan };
}

// ------------------------------------------------------------- people

async function demoUser(email: string, name: string, password?: string): Promise<string> {
  const user = password
    ? await signUp(db, { email, password, displayName: name }, null)
    : await db.user.create({ data: { email, displayName: name } });
  await db.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  return user.id;
}

const station = (p: LatLng) => nearestStation(p, getStations(), 5000)?.station.id ?? "place-pktrm";

// ------------------------------------------------------------- main

async function main() {
  const emailArg = process.argv.indexOf("--email");
  const ownEmail = emailArg > 0 ? process.argv[emailArg + 1]?.trim().toLowerCase() : null;

  // Start clean: the previous run's friends (and demo account), group trips, group, and demo rides.
  // (Deleting a group keeps its trips as solo trips, so they go first.)
  await db.trip.deleteMany({ where: { roomId: ROOM_CODE } });
  await db.user.deleteMany({ where: { OR: [{ email: { endsWith: FRIEND_DOMAIN } }, ...(ownEmail ? [] : [{ email: DEMO_EMAIL }])] } });
  await db.room.deleteMany({ where: { id: ROOM_CODE } });

  let youId: string;
  if (ownEmail) {
    const me = await db.user.findUnique({ where: { email: ownEmail }, select: { id: true } });
    if (!me) throw new Error(`No account with email ${ownEmail}. Sign up in the app first, or run without --email.`);
    youId = me.id;
    await db.ride.deleteMany({ where: { userId: youId, vehicleId: DEMO_VEHICLE } });
  } else {
    youId = await demoUser(DEMO_EMAIL, "Alex", DEMO_PASSWORD);
  }

  const chinatown = await findDestination("dumplings", { lat: 42.3515, lng: -71.0605 }, { id: "demo:chinatown", name: "Chinatown Gate", lat: 42.3512, lng: -71.061 });
  const quincyMarket = await findDestination("Quincy Market", { lat: 42.3601, lng: -71.0549 }, { id: "demo:quincy-market", name: "Quincy Market", lat: 42.3601, lng: -71.0549 });
  if (ownEmail) await db.trip.deleteMany({ where: { userId: youId, roomId: null, placeId: quincyMarket.id } });

  // 1. Solo trip, yesterday: Davis -> Quincy Market.
  const now = Date.now();
  const solo = await recordTrip({ userId: youId, place: quincyMarket, from: SOLO_FROM, startAt: now - 26 * 3600_000, seed: 7 });

  // 2. The group: create BEAN, everyone joins, everyone travels to Chinatown.
  const ids = [youId];
  for (const p of GROUP.slice(1)) ids.push(await demoUser(`${p.name.toLowerCase()}${FRIEND_DOMAIN}`, p.name));
  const current = await db.roomMember.findFirst({ where: { userId: youId, room: { expiresAt: { gt: new Date() } } }, select: { roomId: true } });
  if (current) throw new Error(`That account is already in group ${current.roomId}. Leave it in the app first.`);
  const code = await createRoom(db, youId, { name: "Chinatown Dumpling Night", day: "tonight", startTime: 1110, slots: ["dinner"] }, new Date(), () => ROOM_CODE);
  for (const [i, p] of GROUP.entries()) {
    await joinRoom(db, code, ids[i], { name: p.name === "You" ? "Alex" : p.name, startStationId: station(p.from), homeStationId: station(p.from), budget: 30 }, new Date());
  }
  const arrive = now - 20 * 60_000;
  for (const [i, p] of GROUP.entries()) {
    // Everyone arrives within a few minutes of each other.
    await recordTrip({ userId: ids[i], roomId: code, place: chinatown, from: p.from, arriveAt: arrive + (i - 2) * 90_000, seed: 100 + i });
  }

  // ------------------------------------------------------------- confirm it worked

  const mine = await listMyTrips(db, youId);
  const group = await listRoomTrips(db, youId, code);
  const how = (t: { legs: { mode: string; ride?: { routeName: string | null } }[] }) =>
    [...new Set(t.legs.map((l) => (l.ride?.routeName ?? (l.mode === "walk" ? "walk" : "T"))))].join(" + ");
  const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
  const min = (s: number) => `${Math.round(s / 60)} min`;

  console.log(`\nMy Trips (${ownEmail ?? DEMO_EMAIL}):`);
  for (const t of mine) console.log(`  ${t.roomId ? `[group ${t.roomId}]` : "[solo]     "} ${t.place?.name} · ${km(t.distanceM)} · ${min(t.durationSec)} · ${how(t)} · ${t.arrived ? "arrived" : t.status}`);
  console.log(`\nGroup ${code} trip map: everyone's way to ${group.destination?.name}`);
  for (const t of group.trips) {
    const p = GROUP.find((g) => (g.name === "You" ? t.isYou : g.name === t.name));
    const who = `  ${(t.isYou ? "You" : (t.name ?? "?")).padEnd(6)} from ${p?.where ?? "?"}`;
    console.log(`${who.padEnd(40)} ${km(t.distanceM)} · ${min(t.durationSec)} · ${how(t)} · ${t.arrived ? "arrived" : t.status}${t.startHidden ? " · start hidden" : ""}`);
  }

  const problems = [
    mine.length < 2 && "My Trips should list the solo trip and the group trip",
    group.trips.length !== GROUP.length && `the group map should show ${GROUP.length} trips, not ${group.trips.length}`,
    !group.trips.every((t) => t.arrived) && "everyone should have arrived",
    !mine.find((t) => t.id === solo.id)?.arrived && "the solo trip should have arrived",
  ].filter(Boolean);
  if (problems.length) {
    console.error(`\nNOT OK:\n  - ${problems.join("\n  - ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nOK: trips were recorded, show up in My Trips, and on the group trip map.");
  }
  console.log(`\nSee it: sign in as ${ownEmail ?? `${DEMO_EMAIL} / ${DEMO_PASSWORD}`}, then open /trips and /room/${code}/trips`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
