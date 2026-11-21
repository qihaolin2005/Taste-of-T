// Owner: P2 - Data & Integrations (see TEAM.md)
// Pure path math for recorded trips: clean raw GPS fixes, measure distance, split the path
// into walking vs transit legs, and hide the start of a path from other people.
import { distanceMeters, type LatLng } from "@/lib/geo";

export const TRIP_RULES = {
  /** Fixes worse than this are guesses (indoors, underground) and are dropped. */
  maxAccuracyM: 65,
  /** Moves shorter than this are GPS jitter while standing still. */
  minStepM: 8,
  /** Faster than this between two fixes is a glitch (even commuter rail tops out ~35 m/s). */
  maxSpeedMps: 60,
  /** A trip stores at most this many points (~5+ hours at one every few seconds). */
  maxPoints: 4000,
  /** Steps faster than this are on a vehicle (bus/T); slower is walking. ~22 km/h. */
  transitSpeedMps: 6,
  /** A "transit" stretch shorter than this is noise (a jog, a GPS jump) and counts as walking. */
  minTransitLegM: 250,
  /** Other people don't see the part of your path within this distance of where you started. */
  privacyRadiusM: 200,
} as const;

/** Stored point: [lat, lng, seconds since the trip started]. */
export type StoredPoint = [number, number, number];
export type RawFix = LatLng & { t: number; accuracyM?: number };
export type LegMode = "walk" | "transit";
export type Leg = { mode: LegMode; path: [number, number][]; distanceM: number };

const round5 = (n: number) => Math.round(n * 1e5) / 1e5; // ~1 m
const ll = (p: StoredPoint): LatLng => ({ lat: p[0], lng: p[1] });

export function readPoints(json: unknown): StoredPoint[] {
  if (!Array.isArray(json)) return [];
  return json.filter((p): p is StoredPoint => Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === "number"));
}

/**
 * Append raw fixes (t = seconds since start) to a path. Returns the new path and the meters
 * added. Out-of-order, inaccurate, jittery and impossible-speed fixes are skipped.
 */
export function appendFixes(existing: readonly StoredPoint[], fixes: readonly RawFix[]): { points: StoredPoint[]; addedM: number } {
  const points = [...existing];
  let addedM = 0;
  const sorted = [...fixes].sort((a, b) => a.t - b.t);
  for (const f of sorted) {
    if (points.length >= TRIP_RULES.maxPoints) break;
    if (f.accuracyM != null && f.accuracyM > TRIP_RULES.maxAccuracyM) continue;
    const prev = points.at(-1);
    const t = Math.max(0, Math.round(f.t));
    if (prev) {
      if (t <= prev[2]) continue;
      const m = distanceMeters(ll(prev), f);
      if (m < TRIP_RULES.minStepM) continue;
      if (m / (t - prev[2]) > TRIP_RULES.maxSpeedMps) continue;
      addedM += m;
    }
    points.push([round5(f.lat), round5(f.lng), t]);
  }
  return { points, addedM };
}

export function pathDistance(points: readonly StoredPoint[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += distanceMeters(ll(points[i - 1]), ll(points[i]));
  return m;
}

/**
 * Split a path into walking and transit legs by speed. A gap with no fixes (underground)
 * followed by a jump counts as transit when the average speed over the gap is vehicle speed.
 */
export function splitLegs(points: readonly StoredPoint[]): Leg[] {
  if (points.length < 2) return points.length ? [{ mode: "walk", path: [[points[0][0], points[0][1]]], distanceM: 0 }] : [];
  // 1) classify each step
  const steps = points.slice(1).map((p, i) => {
    const prev = points[i];
    const m = distanceMeters(ll(prev), ll(p));
    const mode: LegMode = m / Math.max(1, p[2] - prev[2]) >= TRIP_RULES.transitSpeedMps ? "transit" : "walk";
    return { m, mode };
  });
  // 2) group runs of the same mode
  type Run = { mode: LegMode; from: number; to: number; m: number }; // point indexes [from, to]
  const runs: Run[] = [];
  steps.forEach((s, i) => {
    const last = runs.at(-1);
    if (last && last.mode === s.mode) {
      last.to = i + 1;
      last.m += s.m;
    } else runs.push({ mode: s.mode, from: i, to: i + 1, m: s.m });
  });
  // 3) short transit runs are noise -> walking; then merge neighbors that now match
  for (const r of runs) if (r.mode === "transit" && r.m < TRIP_RULES.minTransitLegM) r.mode = "walk";
  const merged: Run[] = [];
  for (const r of runs) {
    const last = merged.at(-1);
    if (last && last.mode === r.mode) {
      last.to = r.to;
      last.m += r.m;
    } else merged.push({ ...r });
  }
  return merged.map((r) => ({
    mode: r.mode,
    path: points.slice(r.from, r.to + 1).map((p) => [p[0], p[1]] as [number, number]),
    distanceM: Math.round(r.m),
  }));
}

/** Drop the start of a path until it leaves `radiusM` of the first point (Strava-style privacy zone). */
export function hideStart(points: readonly StoredPoint[], radiusM: number = TRIP_RULES.privacyRadiusM): StoredPoint[] {
  if (!points.length) return [];
  const origin = ll(points[0]);
  const i = points.findIndex((p) => distanceMeters(origin, ll(p)) > radiusM);
  return i === -1 ? [] : points.slice(i);
}
