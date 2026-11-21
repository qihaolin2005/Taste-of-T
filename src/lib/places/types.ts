// Owner: P2 - Data & Integrations (see TEAM.md)
// A restaurant/activity as the app sees it, whatever the source (Google, seed file).
// It IS a RestaurantCandidate (the ML contract, docs/restaurant-source.md), plus extra fields
// the planner and UI use (hours, address, link). Extra fields are ignored by the ML side.
import type { RestaurantCandidate } from "@/features/ml/recommend/restaurant";

/** Minutes after local midnight; `close` may exceed 1440 when a place closes after midnight. */
export type OpenInterval = { open: number; close: number };
/** Keyed by day of week, 0 = Sunday (Boston local time). Missing day = closed. */
export type WeeklyHours = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, OpenInterval[]>>;

export type Place = RestaurantCandidate & {
  name: string;
  lat: number;
  lng: number;
  /** Walk from `stationId` to the door. */
  walkMinutes: number;
  hours?: WeeklyHours;
  address?: string;
  /** Link to the place on Google Maps (Google results only). */
  mapsUrl?: string;
  source: "google" | "seed";
};

export type PlaceCategory = Place["category"];

export type PlaceQuery = {
  /** Search around this T station. */
  stationId: string;
  category?: PlaceCategory;
  /** Free text, e.g. "dumplings" or "boba". Uses Google Text Search. */
  text?: string;
  /** Search radius around the station, meters. Default 800 (about a 10 min walk). */
  radiusM?: number;
  limit?: number;
};

export type PlaceResults = {
  places: Place[];
  from: "google" | "seed";
  /** Why we fell back to the seed list, if we did. */
  warning?: string;
};
