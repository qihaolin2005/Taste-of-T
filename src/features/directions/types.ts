// Owner: P4 - Game Layer & Map (see TEAM.md)
// A trip from where you are to a place, by T and bus: what GET /api/directions returns and the
// T map draws. Client-safe (types and pure helpers only).
import type { LatLng } from "@/lib/geo";

export type RideMode = "subway" | "light_rail" | "bus" | "rail" | "ferry" | "other";

export type WalkLeg = { kind: "walk"; minutes: number; meters: number; /** Where the walk ends, e.g. "Park Street" or the place. */ to: string };

export type RideLeg = {
  kind: "ride";
  mode: RideMode;
  /** "Red Line", "Green Line B", "Bus 1". */
  line: string;
  /** Short label for a badge: "Red", "B", "1". */
  short: string;
  color: string;
  from: LatLng & { name: string };
  to: LatLng & { name: string };
  stops: number;
  minutes: number;
  /** Direction of travel, e.g. "Ashmont/Braintree". */
  headsign?: string;
  /** Scheduled departure (ISO), when the planner knows it. */
  departs?: string;
};

export type TripLeg = WalkLeg | RideLeg;

/** One drawn piece of the trip: a ride in its line color, or a walk. */
export type TripPath = { color: string; walk: boolean; points: LatLng[] };

export type TripPlan = {
  /** "google": live T + bus directions. "offline": our subway-only planner on the MBTA map data. */
  source: "google" | "offline";
  minutes: number;
  legs: TripLeg[];
  path: TripPath[];
};

/** Full T + bus directions in Google Maps. Works on any phone with no API key. No origin = "from here". */
export function googleMapsDirectionsUrl(to: LatLng, from?: LatLng | null): string {
  const q = new URLSearchParams({ api: "1", destination: `${to.lat},${to.lng}`, travelmode: "transit" });
  if (from) q.set("origin", `${from.lat},${from.lng}`);
  return `https://www.google.com/maps/dir/?${q}`;
}

/**
 * The MBTA route ids ("Red", "Green-B", ...) a trip rides, so the map can hide the other lines.
 * Works for both planners: ours names lines "Green Line B" / "Green Line B/C/D/E"; Google says
 * "Red Line" or "Green Line" with a branch letter as the short name. Buses ride no T line.
 */
export function tRoutesInTrip(plan: TripPlan, routeIds: readonly string[]): Set<string> {
  const used = new Set<string>();
  const has = (id: string) => routeIds.includes(id);
  for (const leg of plan.legs) {
    if (leg.kind !== "ride" || (leg.mode !== "subway" && leg.mode !== "light_rail")) continue;
    const text = `${leg.line} ${leg.short}`;
    if (/mattapan/i.test(text)) {
      if (has("Mattapan")) used.add("Mattapan");
      continue;
    }
    const color = /\b(red|orange|blue)\b/i.exec(text)?.[1];
    if (color) {
      const id = color[0].toUpperCase() + color.slice(1).toLowerCase();
      if (has(id)) used.add(id);
      continue;
    }
    if (/green/i.test(text) || /^[BCDE]$/.test(leg.short)) {
      // Branch letters, if named ("Green Line B/C", or short "B"); otherwise every Green branch.
      const letters = /green line ([BCDE](?:\/[BCDE])*)/i.exec(leg.line)?.[1].split("/") ?? (/^[BCDE]$/.test(leg.short) ? [leg.short] : []);
      const ids = letters.length ? letters.map((l) => `Green-${l.toUpperCase()}`) : routeIds.filter((r) => r.startsWith("Green-"));
      for (const id of ids) if (has(id)) used.add(id);
    }
  }
  return used;
}

/** Link to the T map showing the route to a place, for Spin and group results. */
export function routeMapHref(place: { lat?: number | null; lng?: number | null; name?: string | null }): string | null {
  if (typeof place.lat !== "number" || typeof place.lng !== "number") return null;
  const q = new URLSearchParams({ to: `${place.lat.toFixed(6)},${place.lng.toFixed(6)}` });
  if (place.name) q.set("name", place.name);
  return `/map?${q}`;
}

/** "42.35,-71.06" -> { lat, lng }, or null if it isn't a sensible coordinate. */
export function parseLatLng(s: string | null | undefined): LatLng | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(s ?? "");
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
