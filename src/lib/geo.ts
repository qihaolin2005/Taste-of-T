// Owner: P2 - Data & Integrations (see TEAM.md)
// Haversine distance, walk minutes, nearest station.

export type LatLng = { lat: number; lng: number };
export type StationPoint = LatLng & { id: string };

const EARTH_RADIUS_M = 6_371_000;
/** Average city walking pace, ~4.8 km/h. */
const WALK_M_PER_MIN = 80;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Street walking is longer than a straight line; 1.3x is a common city detour factor. */
export function walkMinutes(a: LatLng, b: LatLng): number {
  return Math.ceil((distanceMeters(a, b) * 1.3) / WALK_M_PER_MIN);
}

/** Closest station within maxMeters, or null (e.g. user is outside the T area). */
export function nearestStation<S extends StationPoint>(
  point: LatLng,
  stations: readonly S[],
  maxMeters = 3000,
): { station: S; meters: number } | null {
  let best: { station: S; meters: number } | null = null;
  for (const station of stations) {
    const meters = distanceMeters(point, station);
    if (meters <= maxMeters && (!best || meters < best.meters)) best = { station, meters };
  }
  return best;
}
