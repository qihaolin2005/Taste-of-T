// Owner: P2 - Data & Integrations (see TEAM.md)
// Every live MBTA bus and train (subway, light rail, commuter rail) from V3 /vehicles, for
// verifying rides. (lib/mbta/vehicles.ts is the subway-only feed the map draws.)
//
// One shared 10 s cache: however many people are riding, we make at most ~6 MBTA calls a
// minute, under the 20/min no-key limit. ~500 vehicles, ~200 KB per call.
import { mbtaGet } from "./client";

export type TransitMode = "bus" | "t";

export type LiveVehicle = {
  id: string;
  routeId: string;
  mode: TransitMode;
  lat: number;
  lng: number;
  /** When MBTA last got a position for it. */
  updatedAt: Date;
};

const VEHICLES_TTL_MS = 10_000;
const ROUTES_TTL_MS = 24 * 60 * 60_000;

/**
 * Bus vs T from the route id, so it works even when the routes lookup fails:
 * subway/light rail names and commuter rail ("CR-...") are T; ferries are skipped;
 * everything else (numbered buses, Silver Line "741", "Shuttle-..." replacement buses) is a bus.
 */
export function modeForRoute(routeId: string): TransitMode | null {
  if (/^(Red|Orange|Blue|Mattapan|Green-[BCDE])$/.test(routeId) || routeId.startsWith("CR-")) return "t";
  if (routeId.startsWith("Boat-")) return null;
  return routeId ? "bus" : null;
}

type VehicleAttrs = { latitude: number | null; longitude: number | null; updated_at: string };
type RouteAttrs = { type: number; short_name: string; long_name: string };

let vehicleCache: { at: number; vehicles: LiveVehicle[] } | null = null;
let vehiclesInflight: Promise<LiveVehicle[]> | null = null;
let routeCache: { at: number; names: Map<string, string> } | null = null;

async function fetchVehicles(): Promise<LiveVehicle[]> {
  const data = await mbtaGet<VehicleAttrs>(
    "/vehicles",
    { "filter[route_type]": "0,1,2,3", "fields[vehicle]": "latitude,longitude,updated_at" },
    { timeoutMs: 5000 },
  );
  const out: LiveVehicle[] = [];
  for (const v of data) {
    const routeId = v.relationships?.route?.data?.id ?? "";
    const mode = modeForRoute(routeId);
    const { latitude: lat, longitude: lng } = v.attributes;
    if (!mode || lat == null || lng == null) continue;
    out.push({ id: v.id, routeId, mode, lat, lng, updatedAt: new Date(v.attributes.updated_at) });
  }
  return out;
}

/**
 * Live vehicles, from cache if fresh. If MBTA fails, the last good list is used while it's
 * under a minute old (positions older than that can't verify anything); otherwise this throws.
 */
export async function getLiveTransitVehicles(now = Date.now()): Promise<LiveVehicle[]> {
  if (vehicleCache && now - vehicleCache.at < VEHICLES_TTL_MS) return vehicleCache.vehicles;
  vehiclesInflight ??= fetchVehicles()
    .then((vehicles) => {
      vehicleCache = { at: Date.now(), vehicles };
      return vehicles;
    })
    .finally(() => {
      vehiclesInflight = null;
    });
  try {
    return await vehiclesInflight;
  } catch (err) {
    if (vehicleCache && now - vehicleCache.at < 60_000) return vehicleCache.vehicles;
    throw err;
  }
}

/** "Bus 1", "SL1", "Red Line", "Fitchburg Line". Falls back to the route id. */
export async function routeName(routeId: string, now = Date.now()): Promise<string> {
  if (!routeCache || now - routeCache.at > ROUTES_TTL_MS) {
    try {
      const data = await mbtaGet<RouteAttrs>("/routes", { "filter[type]": "0,1,2,3", "fields[route]": "type,short_name,long_name" }, { timeoutMs: 5000 });
      const names = new Map(
        data.map((r) => {
          const { type, short_name: short, long_name: long } = r.attributes;
          return [r.id, type === 3 ? (/^\d/.test(short) ? `Bus ${short}` : short || long) : long || short || r.id];
        }),
      );
      routeCache = { at: Date.now(), names };
    } catch {
      // names are cosmetic; keep the old cache (or none)
    }
  }
  if (routeId.startsWith("Shuttle-")) return "Shuttle bus";
  return routeCache?.names.get(routeId) ?? routeId;
}

/** For tests. */
export function resetLiveTransitCache() {
  vehicleCache = null;
  vehiclesInflight = null;
  routeCache = null;
}
