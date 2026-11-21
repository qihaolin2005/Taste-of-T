// Owner: P2 - Data & Integrations (see TEAM.md)
// Offline places from data/seed-restaurants.json (hand-written DEMO data, not Google's).
// Used whenever Google isn't configured or fails, so the app works with an empty .env.
import seedFile from "../../../data/seed-restaurants.json";
import { distanceMeters } from "@/lib/geo";
import { getStation } from "@/lib/mbta/stations";
import type { Place, PlaceQuery } from "./types";

const seedPlaces = ((seedFile as { places?: unknown[] }).places ?? []) as Place[];

export function getSeedPlaces(): readonly Place[] {
  return seedPlaces;
}

/** Same filtering as a Google search: near the station, matching category / text. */
export function searchSeed(q: PlaceQuery): Place[] {
  const station = getStation(q.stationId);
  const radius = q.radiusM ?? 800;
  const words = q.text?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  return seedPlaces
    .filter((p) => !q.category || p.category === q.category)
    .filter((p) => !station || p.stationId === q.stationId || distanceMeters(station, p) <= radius)
    .filter((p) => words.every((w) => p.name.toLowerCase().includes(w) || p.tags.some((t) => t.includes(w))))
    .sort((a, b) => (station ? distanceMeters(station, a) - distanceMeters(station, b) : 0))
    .slice(0, q.limit ?? 20);
}
