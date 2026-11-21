// Owner: P2 - Data & Integrations (see TEAM.md)
// Rides: turn location pings into a bus/T ride verified against live MBTA positions, and hand
// verified rides to the rewards system (one ride pays out travel points for one visit).
//
// Flow (phone): during a trip, POST a ping every ~30 s -> pings that don't land on any live
// MBTA vehicle are ignored (nothing stored) -> the first one that does starts a ride locked
// onto that vehicle -> later pings must match the SAME vehicle -> once the rules in match.ts
// pass, the ride is "verified" (its id can go with a reward claim) -> while you stay on the
// vehicle, pings keep extending the ride, so we know where you got off.
import type { PrismaClient } from "@/generated/prisma/client";
import { distanceMeters, type LatLng } from "@/lib/geo";
import type { LiveVehicle, TransitMode } from "@/lib/mbta/liveVehicles";
import { matchAll, matchPing, verificationGap, type Match, type Ping } from "./match";

type Db = PrismaClient;

/** A tracking ride with no ping for this long is abandoned; the next ping starts a new one. */
export const RIDE_IDLE_MS = 15 * 60_000;
/** A verified ride can earn travel points if the reward is claimed within this long. */
export const RIDE_USABLE_FOR_MS = 4 * 60 * 60_000;
/** The ride must end this close to the restaurant to count as "getting there". */
export const RIDE_END_MAX_FROM_PLACE_M = 2000;

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export type RideView = {
  /** null when you're not on a bus/train (nothing was stored). */
  id: string | null;
  /** "none": this ping isn't on any live vehicle and there's no ride going. */
  status: "none" | "tracking" | "verified";
  /** This ping matched the ride's vehicle (false = maybe you got off, or a GPS blip). */
  onVehicle: boolean;
  mode: TransitMode | null;
  routeName: string | null;
  matchedPings: number;
  distanceM: number;
  /** Human-readable progress, e.g. "Keep riding a little longer…". */
  message: string;
  verifiedAt: string | null;
  usedForReward: boolean;
};

type RideRow = Awaited<ReturnType<Db["ride"]["findUniqueOrThrow"]>> & { rewardVisit?: { id: string } | null };

const NOT_ON_A_VEHICLE: RideView = {
  id: null,
  status: "none",
  onVehicle: false,
  mode: null,
  routeName: null,
  matchedPings: 0,
  distanceM: 0,
  message: "Not on a bus or train right now.",
  verifiedAt: null,
  usedForReward: false,
};

function toView(r: RideRow, message: string, onVehicle: boolean): RideView {
  return {
    id: r.id,
    status: r.status as RideView["status"],
    onVehicle,
    mode: (r.mode as TransitMode | null) ?? null,
    routeName: r.routeName,
    matchedPings: r.matchedPings,
    distanceM: Math.round(r.distanceM),
    message,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    usedForReward: !!r.rewardVisit,
  };
}

/** A vehicle you might be on, and how often your pings have matched it. Stored on Ride.candidates. */
type Candidate = {
  routeId: string;
  mode: TransitMode;
  matches: number;
  /** epoch ms of the first/last ping that matched this vehicle */
  firstAt: number;
  lastAt: number;
  /** your (rounded) position at those pings */
  start: [number, number];
  end: [number, number];
  /** meters from you at the last match */
  d: number;
  /** sum of meters from you over all matches: the vehicle you're on averages ~0 m (tie-breaker) */
  dSum?: number;
};
type Candidates = Record<string, Candidate>;

/** Candidates not matched for this long are dropped; at most this many are kept. */
const CANDIDATE_DROP_MS = 3 * 60_000;
const MAX_CANDIDATES = 8;

function readCandidates(ride: { candidates: unknown; vehicleId: string | null } & Partial<RideRow>): Candidates {
  const c = ride.candidates;
  if (c && typeof c === "object" && !Array.isArray(c) && Object.keys(c).length) return c as Candidates;
  // rides from before candidates existed: their one locked vehicle
  if (ride.vehicleId && ride.routeId && ride.mode && ride.firstMatchAt && ride.lastMatchAt && ride.startLat != null && ride.endLat != null) {
    return {
      [ride.vehicleId]: {
        routeId: ride.routeId,
        mode: ride.mode as TransitMode,
        matches: ride.matchedPings ?? 1,
        firstAt: ride.firstMatchAt.getTime(),
        lastAt: ride.lastMatchAt.getTime(),
        start: [ride.startLat, ride.startLng!],
        end: [ride.endLat, ride.endLng!],
        d: 0,
      },
    };
  }
  return {};
}

function addMatches(prev: Candidates, matches: readonly Match[], here: LatLng, now: Date): Candidates {
  const next: Candidates = {};
  for (const [id, c] of Object.entries(prev)) if (now.getTime() - c.lastAt <= CANDIDATE_DROP_MS) next[id] = c;
  for (const { vehicle: v, distanceM } of matches) {
    const c = next[v.id];
    next[v.id] = c
      ? { ...c, matches: c.matches + 1, lastAt: now.getTime(), end: [here.lat, here.lng], d: Math.round(distanceM), dSum: (c.dSum ?? c.d * c.matches) + Math.round(distanceM) }
      : {
          routeId: v.routeId,
          mode: v.mode,
          matches: 1,
          firstAt: now.getTime(),
          lastAt: now.getTime(),
          start: [here.lat, here.lng],
          end: [here.lat, here.lng],
          d: Math.round(distanceM),
          dSum: Math.round(distanceM),
        };
  }
  const kept = Object.entries(next)
    .sort(([, a], [, b]) => b.matches - a.matches || b.lastAt - a.lastAt)
    .slice(0, MAX_CANDIDATES);
  return Object.fromEntries(kept);
}

/** Most matches wins; ties go to the one that's been closest to you on average, then the most recent. */
function pickLeader(c: Candidates): string | null {
  const avg = (x: Candidate) => (x.dSum ?? x.d * x.matches) / x.matches;
  let best: [string, Candidate] | null = null;
  for (const e of Object.entries(c)) {
    const x = e[1];
    const b = best?.[1];
    if (!b || x.matches > b.matches || (x.matches === b.matches && (avg(x) < avg(b) || (avg(x) === avg(b) && x.lastAt > b.lastAt)))) best = e;
  }
  return best?.[0] ?? null;
}

export type PingDeps = {
  vehicles: readonly LiveVehicle[];
  routeName: (routeId: string) => Promise<string>;
  now?: Date;
};

/**
 * Record one ping. Continues `rideId` (or your current tracking ride) if it's still active.
 * Otherwise a ping that lands on a live vehicle starts a ride; one that doesn't stores nothing.
 */
export async function recordPing(db: Db, userId: string, ping: Ping, deps: PingDeps, rideId?: string | null): Promise<RideView> {
  const now = deps.now ?? new Date();
  const activeSince = new Date(now.getTime() - RIDE_IDLE_MS);
  const here: LatLng = { lat: round4(ping.lat), lng: round4(ping.lng) };
  const ride = rideId
    ? await db.ride.findFirst({ where: { id: rideId, userId, lastPingAt: { gte: activeSince } } })
    : await db.ride.findFirst({ where: { userId, status: "tracking", lastPingAt: { gte: activeSince } }, orderBy: { lastPingAt: "desc" } });

  if (!ride) {
    const matches = matchAll(ping, deps.vehicles, now);
    if (!matches.length) return NOT_ON_A_VEHICLE;
    const candidates = addMatches({}, matches, here, now);
    const v = matches[0].vehicle; // closest, until the pings show which one you're really on
    const created = await db.ride.create({
      data: {
        userId,
        vehicleId: v.id,
        routeId: v.routeId,
        routeName: await deps.routeName(v.routeId),
        mode: v.mode,
        candidates: candidates as object,
        matchedPings: 1,
        firstMatchAt: now,
        lastMatchAt: now,
        startLat: here.lat,
        startLng: here.lng,
        endLat: here.lat,
        endLng: here.lng,
        lastPingAt: now,
      },
    });
    return toView(created, "Found your bus/train. Keep riding…", true);
  }

  if (ride.status === "verified") {
    // Already verified: keep following the same vehicle to learn where you got off.
    const match = ride.vehicleId ? matchPing(ping, deps.vehicles, now, { onlyVehicleId: ride.vehicleId }) : null;
    const start = { lat: ride.startLat!, lng: ride.startLng! };
    const updated = await db.ride.update({
      where: { id: ride.id },
      data: match
        ? { matchedPings: ride.matchedPings + 1, lastMatchAt: now, endLat: here.lat, endLng: here.lng, distanceM: distanceMeters(start, here), lastPingAt: now }
        : { lastPingAt: now },
    });
    return toView(updated, match ? `Ride verified ✓ Still on ${ride.routeName ?? "your bus/train"}.` : "Ride verified ✓", !!match);
  }

  // Still working out which vehicle you're on: every vehicle near this ping scores a match.
  // The one you're really on keeps matching; buses that were just nearby (bunched buses, the
  // next Green Line train) drift away. The leader (most matches) is "your" vehicle.
  const matches = matchAll(ping, deps.vehicles, now);
  const candidates = addMatches(readCandidates(ride), matches, here, now);
  const leaderId = pickLeader(candidates);
  if (!leaderId) {
    const updated = await db.ride.update({ where: { id: ride.id }, data: { lastPingAt: now, candidates: candidates as object } });
    return toView(updated, "Looking for your bus or train… (MBTA positions update every few seconds)", false);
  }
  const lead = candidates[leaderId];
  const onVehicle = matches.some((m) => m.vehicle.id === leaderId);
  const start = { lat: lead.start[0], lng: lead.start[1] };
  const end = { lat: lead.end[0], lng: lead.end[1] };
  const gap = verificationGap({ matchedPings: lead.matches, firstMatchAt: new Date(lead.firstAt), lastMatchAt: new Date(lead.lastAt), start, end });

  const updated = await db.ride.update({
    where: { id: ride.id },
    data: {
      vehicleId: leaderId,
      routeId: lead.routeId,
      routeName: leaderId === ride.vehicleId && ride.routeName ? ride.routeName : await deps.routeName(lead.routeId),
      mode: lead.mode,
      candidates: candidates as object,
      matchedPings: lead.matches,
      firstMatchAt: new Date(lead.firstAt),
      lastMatchAt: new Date(lead.lastAt),
      startLat: start.lat,
      startLng: start.lng,
      endLat: end.lat,
      endLng: end.lng,
      distanceM: distanceMeters(start, end),
      lastPingAt: now,
      ...(gap === null ? { status: "verified", verifiedAt: now } : {}),
    },
  });
  const msg = gap ?? "Ride verified! You'll get travel points with your next reward.";
  return toView(updated, onVehicle ? msg : "Lost your vehicle for a moment. Keep the app open…", onVehicle);
}

export async function listRides(db: Db, userId: string, now = new Date()): Promise<RideView[]> {
  const rows = await db.ride.findMany({
    where: { userId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { rewardVisit: { select: { id: true } } },
  });
  return rows.map((r) => toView(r, r.status === "verified" ? "Verified" : "Not verified", false));
}

export type UsableRide = { id: string; mode: TransitMode; routeName: string | null };

/**
 * Can this ride earn travel points for a visit to `place`? Returns the ride, or a reason it
 * can't (the claim then still gets meal/spend points, just no travel points).
 */
export async function checkRideForReward(
  db: Db,
  userId: string,
  rideId: string,
  opts: { now: Date; place?: LatLng | null },
): Promise<{ ride: UsableRide } | { reason: string }> {
  const r = await db.ride.findFirst({ where: { id: rideId, userId }, include: { rewardVisit: { select: { id: true } } } });
  if (!r) return { reason: "We couldn't find that ride." };
  if (r.status !== "verified" || !r.mode || !r.verifiedAt || r.lastMatchAt == null) return { reason: "That ride wasn't verified, so no travel points." };
  if (r.rewardVisit) return { reason: "That ride already earned travel points for another visit." };
  if (opts.now.getTime() - r.lastMatchAt.getTime() > RIDE_USABLE_FOR_MS) return { reason: "That ride was too long ago to count for this visit." };
  if (opts.place && r.endLat != null && r.endLng != null) {
    const d = distanceMeters({ lat: r.endLat, lng: r.endLng }, opts.place);
    if (d > RIDE_END_MAX_FROM_PLACE_M) return { reason: `That ride ended ${(d / 1000).toFixed(1)} km from this restaurant, so it doesn't count.` };
  }
  return { ride: { id: r.id, mode: r.mode as TransitMode, routeName: r.routeName } };
}
