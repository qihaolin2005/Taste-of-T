// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// "Were you actually at the restaurant?" A claim needs ONE of these, around the receipt time
// (config.presence.windowHours before or after it):
//   here - the phone's location sent with the claim is near the place, with a usable GPS fix
//          (claiming at the table, or right after)
//   trip - a trip you recorded (src/features/trips) passed near the place
//   ride - a bus/T ride verified against live MBTA data (src/features/rides) ended near it
// Only which proof was used is stored, never the coordinates.
// GPS can be faked by a determined cheater; this stops casual "type a receipt from home" claims.
import type { PrismaClient } from "@/generated/prisma/client";
import { distanceMeters, type LatLng } from "@/lib/geo";
import { checkIn, CHECKIN_CONFIG } from "@/features/gamification/checkin";
import { REWARDS_CONFIG, type RewardsConfig } from "./config";

type Db = PrismaClient;
const HOUR = 3_600_000;

export type PresenceFix = LatLng & { accuracyM?: number };
/** How the visit was confirmed. "unchecked": we don't know where the place is, so it can't be checked. */
export type VisitProof = "here" | "trip" | "ride" | "unchecked";

/**
 * Is this phone fix at the place? The shared GPS check-in (src/features/gamification/checkin.ts):
 * within its radius plus some of the reported GPS error, and not a hopelessly rough fix.
 */
export function fixIsNear(fix: PresenceFix, place: LatLng): { ok: true } | { ok: false; reason: string } {
  const r = checkIn(fix, place, CHECKIN_CONFIG);
  return r.ok ? { ok: true } : { ok: false, reason: r.message };
}

/**
 * The verified bus/T ride that took you to this place, if any: not yet used for points, ended
 * within config.presence.rideEndRadiusM of it, around the receipt time. Newest first.
 * Used when the claim doesn't name a ride, so nobody has to pick one by hand.
 */
export async function findRideToPlace(
  db: Db,
  userId: string,
  opts: { place: LatLng | null; receiptAt: Date; config?: RewardsConfig },
): Promise<string | null> {
  const cfg = opts.config ?? REWARDS_CONFIG;
  if (!opts.place) return null;
  const w = cfg.presence.windowHours * HOUR;
  const rides = await db.ride.findMany({
    where: {
      userId,
      status: "verified",
      rewardVisit: null,
      lastMatchAt: { gte: new Date(opts.receiptAt.getTime() - w), lte: new Date(opts.receiptAt.getTime() + w) },
      endLat: { not: null },
      endLng: { not: null },
    },
    orderBy: { lastMatchAt: "desc" },
    select: { id: true, endLat: true, endLng: true },
  });
  return rides.find((r) => distanceMeters({ lat: r.endLat!, lng: r.endLng! }, opts.place!) <= cfg.presence.rideEndRadiusM)?.id ?? null;
}

export async function proveVisit(
  db: Db,
  userId: string,
  opts: { place: LatLng | null; placeName?: string | null; here?: PresenceFix; receiptAt: Date; now: Date; config?: RewardsConfig },
): Promise<{ proof: VisitProof } | { reason: string }> {
  const cfg = opts.config ?? REWARDS_CONFIG;
  const p = cfg.presence;
  if (!opts.place) return { proof: "unchecked" };
  const place = opts.place;
  const from = opts.receiptAt.getTime() - p.windowHours * HOUR;
  const to = opts.receiptAt.getTime() + p.windowHours * HOUR;
  const inWindow = (t: number) => t >= from && t <= to;

  // 1. Here now
  let hereNote: string | null = null;
  if (opts.here) {
    const near = fixIsNear(opts.here, place);
    if (near.ok && inWindow(opts.now.getTime())) return { proof: "here" };
    hereNote = near.ok ? `Your receipt is from more than ${p.windowHours} hours ago.` : near.reason;
  }

  // 2. A recorded trip that passed near the place in the window
  const trips = await db.trip.findMany({
    where: { userId, startedAt: { lte: new Date(to) }, OR: [{ lastPointAt: { gte: new Date(from) } }, { lastPointAt: null, startedAt: { gte: new Date(from) } }] },
    select: { startedAt: true, points: true },
  });
  for (const t of trips) {
    const pts = Array.isArray(t.points) ? (t.points as unknown[]) : [];
    for (const pt of pts) {
      if (!Array.isArray(pt) || pt.length < 3) continue;
      const [lat, lng, sec] = pt as number[];
      if (inWindow(t.startedAt.getTime() + sec * 1000) && distanceMeters({ lat, lng }, place) <= CHECKIN_CONFIG.radiusM) return { proof: "trip" };
    }
  }

  // 3. A verified ride that ended near the place in the window
  const rides = await db.ride.findMany({
    where: { userId, status: "verified", lastMatchAt: { gte: new Date(from), lte: new Date(to) }, endLat: { not: null }, endLng: { not: null } },
    select: { endLat: true, endLng: true },
  });
  if (rides.some((r) => distanceMeters({ lat: r.endLat!, lng: r.endLng! }, place) <= p.rideEndRadiusM)) return { proof: "ride" };

  const where = opts.placeName ?? "the restaurant";
  return {
    reason: [
      `We couldn't confirm you were at ${where}.`,
      hereNote,
      opts.here ? null : "Turn on location and claim while you're there,",
      opts.here ? "Claim while you're there, or record your trip there next time." : "or record your trip there next time.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
