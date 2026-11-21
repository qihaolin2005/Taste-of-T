// Owner: P2 - Data & Integrations (see TEAM.md)
// Station lookups backed by data/stations.json.
// TODO(P2): fill data/stations.json via scripts/fetch-stations.ts; swap the local type for
// the shared `Station` from src/types once P1 defines it.
import stationsFile from "../../../data/stations.json";
import type { StationPoint } from "../geo";

export type StationRecord = StationPoint & { name: string; lines?: string[] };

const stations = (stationsFile as { stations?: StationRecord[] }).stations ?? [];
const byId = new Map(stations.map((s) => [s.id, s]));

export function getStations(): readonly StationRecord[] {
  return stations;
}

export function getStation(id: string): StationRecord | undefined {
  return byId.get(id);
}

/** True if the id is a known station. While stations.json is still empty, accept any id. */
export function isKnownStation(id: string): boolean {
  return stations.length === 0 || byId.has(id);
}
