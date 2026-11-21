// Owner: P2 - Data & Integrations (see TEAM.md)
// Station + line lookups backed by data/stations.json (an MBTA snapshot; refresh with
// `npm run stations`). Reading the snapshot, not the live API, keeps the app working offline.
// TODO(P1/P2): swap these local types for the shared Station/Line in src/types once defined.
import stationsFile from "../../../data/stations.json";
import type { StationPoint } from "../geo";

export type StationRecord = StationPoint & { name: string; lines: string[] };
export type LineRecord = {
  id: string; // MBTA route id: "Red", "Orange", "Green-B", ...
  name: string;
  color: string; // "#DA291C"
  stationIds: string[]; // in order along the line
  shapes: string[]; // encoded polylines (decode with lib/polyline)
};

type StationsFile = { stations?: StationRecord[]; lines?: LineRecord[]; fetchedAt?: string };
const file = stationsFile as StationsFile;
const stations = file.stations ?? [];
const lines = file.lines ?? [];
const byId = new Map(stations.map((s) => [s.id, s]));

export function getStations(): readonly StationRecord[] {
  return stations;
}

export function getLines(): readonly LineRecord[] {
  return lines;
}

export function getStation(id: string): StationRecord | undefined {
  return byId.get(id);
}

export const stationsSnapshotDate = file.fetchedAt ?? null;

/** True if the id is a known station. While stations.json is still empty, accept any id. */
export function isKnownStation(id: string): boolean {
  return stations.length === 0 || byId.has(id);
}
