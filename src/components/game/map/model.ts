// Owner: P4 - Game Layer & Map (see TEAM.md)
// Map data shared by the Google and SVG renderers.
import type { LatLng } from "@/lib/geo";
import type { LineRecord, StationRecord } from "@/lib/mbta/stations";
import { decodePolyline } from "@/lib/polyline";

export type { LineRecord, StationRecord };

/** Riders think in lines, not MBTA route ids: Green-B..E are all "Green Line". */
export type FamilyId = "Red" | "Mattapan" | "Orange" | "Blue" | "Green";
export type Family = { id: FamilyId; name: string; color: string };

export const FAMILIES: Family[] = [
  { id: "Red", name: "Red Line", color: "#DA291C" },
  { id: "Orange", name: "Orange Line", color: "#ED8B00" },
  { id: "Blue", name: "Blue Line", color: "#003DA5" },
  { id: "Green", name: "Green Line", color: "#00843D" },
  { id: "Mattapan", name: "Mattapan Trolley", color: "#DA291C" },
];
const familyById = new Map(FAMILIES.map((f) => [f.id, f]));

export function familyOf(routeId: string): Family {
  const id = (routeId.startsWith("Green") ? "Green" : routeId) as FamilyId;
  return familyById.get(id) ?? { id, name: routeId, color: "#8e8e93" };
}

export function stationFamilies(station: StationRecord): Family[] {
  return [...new Map(station.lines.map((r) => [familyOf(r).id, familyOf(r)])).values()];
}

/** Interchange stations (2+ lines) get the classic white-with-black-ring dot. */
export function isInterchange(station: StationRecord): boolean {
  return stationFamilies(station).length > 1;
}

/** With a route showing, only the lines it rides (and their stations/trains) are drawn. */
export function onVisibleRoute(visible: ReadonlySet<string> | null | undefined, routeIds: readonly string[]): boolean {
  return !visible || routeIds.some((r) => visible.has(r));
}

export type DrawnLine = { id: string; color: string; paths: LatLng[][] };

export function decodeLines(lines: readonly LineRecord[]): DrawnLine[] {
  return lines.map((l) => ({ id: l.id, color: l.color, paths: l.shapes.map(decodePolyline) }));
}

/** Downtown Boston, where most food quests happen. */
export const DOWNTOWN: LatLng = { lat: 42.3564, lng: -71.0624 };
