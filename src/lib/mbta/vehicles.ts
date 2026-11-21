// Owner: P2 - Data & Integrations (see TEAM.md)
// Live subway train positions from MBTA V3 /vehicles.
// One shared server-side cache (10 s) means all phones together make at most ~6 MBTA
// requests/minute, safely under the 20/min no-key limit. If MBTA fails, serve the last
// good data (marked stale) or nothing; the map still works from the static snapshot.
import { mbtaGet } from "./client";

export type Vehicle = {
  id: string;
  routeId: string;
  lat: number;
  lng: number;
  bearing: number | null;
  status: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO" | string;
  stopId: string | null;
  directionId: 0 | 1 | null;
  label: string | null;
  updatedAt: string;
};

export type VehiclesResult = {
  vehicles: Vehicle[];
  source: "live" | "stale" | "unavailable";
  fetchedAt: string | null;
};

const ROUTES = "Red,Mattapan,Orange,Blue,Green-B,Green-C,Green-D,Green-E";
const TTL_MS = 10_000;

type Attrs = {
  latitude: number;
  longitude: number;
  bearing: number | null;
  current_status: string;
  direction_id: 0 | 1 | null;
  label: string | null;
  updated_at: string;
};

let cache: { at: number; vehicles: Vehicle[] } | null = null;
let inflight: Promise<VehiclesResult> | null = null;

async function fetchVehicles(): Promise<Vehicle[]> {
  const data = await mbtaGet<Attrs>(
    "/vehicles",
    { "filter[route]": ROUTES, "fields[vehicle]": "latitude,longitude,bearing,current_status,direction_id,label,updated_at" },
    { timeoutMs: 4000 },
  );
  return data.map((v) => ({
    id: v.id,
    routeId: v.relationships?.route?.data?.id ?? "",
    lat: v.attributes.latitude,
    lng: v.attributes.longitude,
    bearing: v.attributes.bearing,
    status: v.attributes.current_status,
    stopId: v.relationships?.stop?.data?.id ?? null,
    directionId: v.attributes.direction_id,
    label: v.attributes.label,
    updatedAt: v.attributes.updated_at,
  }));
}

export async function getVehicles(now = Date.now()): Promise<VehiclesResult> {
  if (cache && now - cache.at < TTL_MS) {
    return { vehicles: cache.vehicles, source: "live", fetchedAt: new Date(cache.at).toISOString() };
  }
  // Collapse concurrent requests into one MBTA call.
  inflight ??= fetchVehicles()
    .then((vehicles): VehiclesResult => {
      cache = { at: Date.now(), vehicles };
      return { vehicles, source: "live", fetchedAt: new Date(cache.at).toISOString() };
    })
    .catch((): VehiclesResult =>
      cache
        ? { vehicles: cache.vehicles, source: "stale", fetchedAt: new Date(cache.at).toISOString() }
        : { vehicles: [], source: "unavailable", fetchedAt: null },
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
