// Owner: P2 - Data & Integrations (see TEAM.md)
// Where we look for food. Google returns at most 20 places per request, so instead of every
// T station we sample the food-heavy ones. Each full refresh = hubs x categories requests
// (9 x 3 = 27), so keep this list short. Add a hub here to cover a new neighborhood.
import type { PlaceCategory } from "./types";

export type Hub = { stationId: string; neighborhood: string; city: string };

export const HUBS: Hub[] = [
  { stationId: "place-chncl", neighborhood: "Chinatown", city: "Boston" },
  { stationId: "place-dwnxg", neighborhood: "Downtown", city: "Boston" },
  { stationId: "place-haecl", neighborhood: "North End", city: "Boston" },
  { stationId: "place-coecl", neighborhood: "Back Bay", city: "Boston" },
  { stationId: "place-kencl", neighborhood: "Fenway", city: "Boston" },
  { stationId: "place-knncl", neighborhood: "Kendall", city: "Cambridge" },
  { stationId: "place-cntsq", neighborhood: "Central Square", city: "Cambridge" },
  { stationId: "place-harsq", neighborhood: "Harvard Square", city: "Cambridge" },
  { stationId: "place-davis", neighborhood: "Davis Square", city: "Somerville" },
];

/** Google place types to search for each of our stop categories. */
export const CATEGORY_TYPES: Record<PlaceCategory, string[]> = {
  dinner: ["restaurant"],
  dessert: ["dessert_shop", "ice_cream_shop", "bakery", "cafe", "tea_house"], // tea_house = boba
  activity: ["bowling_alley", "movie_theater", "museum", "amusement_center", "art_gallery", "night_club"],
};

export const HUB_RADIUS_M = 700;
