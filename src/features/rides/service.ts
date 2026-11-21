// Owner: P2 - Data & Integrations (see TEAM.md)
// Rides: turn location pings into a bus/T ride verified against live MBTA positions, and hand
// verified rides to the rewards system (one ride pays out travel points for one visit).
//
// Flow (phone): while riding, POST a ping every ~30 s -> first ping that lands on a live MBTA
// vehicle locks onto it -> later pings must match the SAME vehicle -> once the rules in
// match.ts pass, the ride is "verified" and its id can be sent with a reward claim.
import type { PrismaClient } from "@/generated/prisma/client";
import { distanceMeters, type LatLng } from "@/lib/geo";
import type { LiveVehicle, TransitMode } from "@/lib/mbta/liveVehicles";
import { matchPing, verificationGap, type Ping } from "./match";

type Db = PrismaClient;

/** A tracking ride with no ping for this long is abandoned; the next ping starts a new one. */
export const RIDE_IDLE_MS = 15 * 60_000;
/** A verified ride can earn travel points if the reward is claimed within this long. */
export const RIDE_USABLE_FOR_MS = 4 * 60 * 60_000;
/** The ride must end this close to the restaurant to count as "getting there". */
export const RIDE_END_MAX_FROM_PLACE_M = 2000;

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export type RideView = {
  id: string;
  status: "tracking" | "verified";
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

function toView(r: RideRow, message: string): RideView {
  return {
    id: r.id,
    status: r.status as RideView["status"],
    mode: (r.mode as TransitMode | null) ?? null,
    routeName: r.routeName,
    matchedPings: r.matchedPings,
    distanceM: Math.round(r.distanceM),
    message,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    usedForReward: !!r.rewardVisit,
  };
}

export type PingDeps = {
  vehicles: readonly LiveVehicle[];
  routeName: (routeId: string) => Promise<string>;
  now?: Date;
};

/**
 * Record one ping. Continues the user's current ride (or `rideId`) if it's still active,
 * otherwise starts a new one. Unmatched pings change nothing and aren't stored.
 */
export async function recordPing(db: Db, userId: string, ping: Ping, deps: PingDeps, rideId?: string): Promise<RideView> {
  const now = deps.now ?? new Date();
  const activeSince = new Date(now.getTime() - RIDE_IDLE_MS);
  let ride = rideId
    ? await db.ride.findFirst({ where: { id: rideId, userId, lastPingAt: { gte: activeSince } } })
    : await db.ride.findFirst({ where: { userId, status: "tracking", lastPingAt: { gte: activeSince } }, orderBy: { lastPingAt: "desc" } });

  if (ride?.status === "verified") return toView(ride, "Ride verified! You'll get travel points with your next reward.");
  ride ??= await db.ride.create({ data: { userId, lastPingAt: now } });

  // Continuing a ride: stay on the same vehicle. If we only had one match, allow switching
  // (the first lock may have been the wrong bus at a busy stop).
  let match = matchPing(ping, deps.vehicles, now, ride.vehicleId ? { onlyVehicleId: ride.vehicleId } : {});
  let relock = false;
  if (!match && ride.vehicleId && ride.matchedPings <= 1) {
    match = matchPing(ping, deps.vehicles, now);
    relock = !!match;
  }

  if (!match) {
    const updated = await db.ride.update({ where: { id: ride.id }, data: { lastPingAt: now } });
    const msg = ride.vehicleId ? "Lost your vehicle for a moment. Keep the app open…" : "Looking for your bus or train… (MBTA positions update every few seconds)";
    return toView(updated, msg);
  }

  const v = match.vehicle;
  const here: LatLng = { lat: round4(ping.lat), lng: round4(ping.lng) };
  const fresh = !ride.vehicleId || relock;
  const start = fresh ? here : { lat: ride.startLat!, lng: ride.startLng! };
  const firstMatchAt = fresh ? now : ride.firstMatchAt!;
  const matchedPings = fresh ? 1 : ride.matchedPings + 1;
  const gap = verificationGap({ matchedPings, firstMatchAt, lastMatchAt: now, start, end: here });

  const updated = await db.ride.update({
    where: { id: ride.id },
    data: {
      vehicleId: v.id,
      routeId: v.routeId,
      routeName: fresh ? await deps.routeName(v.routeId) : ride.routeName,
      mode: v.mode,
      matchedPings,
      firstMatchAt,
      lastMatchAt: now,
      startLat: start.lat,
      startLng: start.lng,
      endLat: here.lat,
      endLng: here.lng,
      distanceM: distanceMeters(start, here),
      lastPingAt: now,
      ...(gap === null ? { status: "verified", verifiedAt: now } : {}),
    },
  });
  return toView(updated, gap ?? "Ride verified! You'll get travel points with your next reward.");
}

export async function listRides(db: Db, userId: string, now = new Date()): Promise<RideView[]> {
  const rows = await db.ride.findMany({
    where: { userId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { rewardVisit: { select: { id: true } } },
  });
  return rows.map((r) => toView(r, r.status === "verified" ? "Verified" : "Not verified"));
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
