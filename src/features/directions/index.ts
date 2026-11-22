// Owner: P4 - Game Layer & Map (see TEAM.md)
// Directions by T and bus to a place. Server-side entry point: planTrip().
//   1. Google Routes transit (T + bus, live schedules) when ROUTES_API_KEY is set
//   2. otherwise, or if Google fails, the offline subway planner on the MBTA snapshot
// Client code imports types/helpers from "@/features/directions/types" instead.
import type { LatLng } from "@/lib/geo";
import { getLines, getStations } from "@/lib/mbta/stations";
import { googleTransitTrip, GoogleRoutesError } from "./googleTransit";
import { buildNetwork, planSubwayTrip, type Network } from "./subwayPlanner";
import type { TripPlan } from "./types";

export * from "./types";
export { buildNetwork, planSubwayTrip, PLANNER_CONFIG, lineBranches } from "./subwayPlanner";
export { parseGoogleRoute } from "./googleTransit";

let network: Network | null = null;
/** After Google rejects the key (not enabled, wrong key), stop asking for a while. */
let googleOffUntil = 0;

export function googleDirectionsEnabled(): boolean {
  return !!process.env.ROUTES_API_KEY;
}

export async function planTrip(from: LatLng, to: LatLng & { name?: string }, now = Date.now()): Promise<TripPlan | null> {
  const key = process.env.ROUTES_API_KEY;
  if (key && now >= googleOffUntil) {
    try {
      const plan = await googleTransitTrip(from, to, key, AbortSignal.timeout(8000));
      if (plan) return plan;
    } catch (err) {
      if (err instanceof GoogleRoutesError && (err.status === 400 || err.status === 401 || err.status === 403)) {
        googleOffUntil = now + 10 * 60_000;
        console.error(`directions: Google Routes rejected the request (${err.status}); using the offline planner for 10 min. Is the Routes API enabled for ROUTES_API_KEY?`);
      } else {
        console.error("directions: Google Routes failed, using the offline planner:", (err as Error).message);
      }
    }
  }
  network ??= buildNetwork(getStations(), getLines());
  return planSubwayTrip(network, from, to);
}
