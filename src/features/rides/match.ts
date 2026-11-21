// Owner: P2 - Data & Integrations (see TEAM.md)
// Pure ride-verification rules. No DB, no network: service.ts feeds in live MBTA vehicles.
import { distanceMeters, type LatLng } from "@/lib/geo";
import type { LiveVehicle } from "@/lib/mbta/liveVehicles";

export const RIDE_RULES = {
  /** Base match distance between your phone and the vehicle's reported position. */
  baseRadiusM: 75,
  /** Phone GPS accuracy counts toward the radius, up to this much. */
  maxAccuracyAllowanceM: 75,
  /** MBTA positions lag; a vehicle moving ~10 m/s may have moved since. Allow this per second of lag... */
  lagAllowanceMPerSec: 10,
  /** ...for at most this many seconds. Positions older than maxVehicleAgeSec are ignored. */
  maxLagSec: 45,
  maxVehicleAgeSec: 90,
  /** Phone fixes worse than this can't verify anything (indoor / underground guesses). */
  maxPhoneAccuracyM: 150,
  /** Verified needs this many matches on the same vehicle... */
  minMatches: 2,
  /** ...spread over at least this long... */
  minDurationSec: 60,
  /** ...covering at least this distance... */
  minDistanceM: 300,
  /** ...faster than walking (m/s) and slower than any MBTA vehicle could go. */
  minAvgSpeedMps: 2.5,
  maxAvgSpeedMps: 40,
};

export type Ping = LatLng & { accuracyM?: number };

export type Match = { vehicle: LiveVehicle; distanceM: number };

/** How close the vehicle must be, given phone accuracy and how stale MBTA's position is. */
export function matchRadius(accuracyM: number | undefined, vehicleAgeSec: number, r = RIDE_RULES): number {
  const acc = Math.min(Math.max(accuracyM ?? 30, 0), r.maxAccuracyAllowanceM);
  const lag = Math.min(Math.max(vehicleAgeSec, 0), r.maxLagSec) * r.lagAllowanceMPerSec;
  return r.baseRadiusM + acc + lag;
}

/**
 * The live vehicle you're most plausibly on: within its match radius, position fresh.
 * If `onlyVehicleId` is given, only that vehicle counts (continuing a ride).
 */
export function matchPing(ping: Ping, vehicles: readonly LiveVehicle[], now: Date, opts: { onlyVehicleId?: string } = {}, r = RIDE_RULES): Match | null {
  if (ping.accuracyM != null && ping.accuracyM > r.maxPhoneAccuracyM) return null;
  let best: Match | null = null;
  for (const v of vehicles) {
    if (opts.onlyVehicleId && v.id !== opts.onlyVehicleId) continue;
    const ageSec = (now.getTime() - v.updatedAt.getTime()) / 1000;
    if (ageSec > r.maxVehicleAgeSec) continue;
    const d = distanceMeters(ping, v);
    if (d <= matchRadius(ping.accuracyM, ageSec, r) && (!best || d < best.distanceM)) best = { vehicle: v, distanceM: d };
  }
  return best;
}

export type RideProgress = {
  matchedPings: number;
  firstMatchAt: Date;
  lastMatchAt: Date;
  start: LatLng;
  end: LatLng;
};

/** Why a ride isn't verified yet (null = verified). Shown to the user as progress. */
export function verificationGap(p: RideProgress, r = RIDE_RULES): string | null {
  const seconds = (p.lastMatchAt.getTime() - p.firstMatchAt.getTime()) / 1000;
  const meters = distanceMeters(p.start, p.end);
  if (p.matchedPings < r.minMatches) return "Found your bus/train. Keep riding…";
  if (seconds < r.minDurationSec) return "Keep riding a little longer…";
  if (meters < r.minDistanceM) return "Waiting for the vehicle to move…";
  const speed = meters / seconds;
  if (speed < r.minAvgSpeedMps) return "Moving slower than a bus. Still checking…";
  if (speed > r.maxAvgSpeedMps) return "That doesn't look like a real ride.";
  return null;
}
