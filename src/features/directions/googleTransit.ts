// Owner: P4 - Game Layer & Map (see TEAM.md)
// Live T + bus directions from the Google Routes API (computeRoutes, travelMode TRANSIT).
// Server-only: needs ROUTES_API_KEY, a server key with the "Routes API" enabled. The Places key
// is restricted to Places, so it can't be reused unless Routes is added to it in Cloud Console.
// parseGoogleRoute() is pure and tested; the fetch is a thin wrapper.
import { z } from "zod";
import type { LatLng } from "@/lib/geo";
import { decodePolyline } from "@/lib/polyline";
import type { RideMode, TripLeg, TripPath, TripPlan } from "./types";

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = [
  "routes.duration",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.polyline.encodedPolyline",
  "routes.legs.steps.transitDetails",
].join(",");

const latLng = z.object({ latitude: z.number(), longitude: z.number() });
const stop = z.object({ name: z.string().optional(), location: z.object({ latLng }).optional() }).optional();
const stepSchema = z.object({
  travelMode: z.string().optional(),
  staticDuration: z.string().optional(),
  distanceMeters: z.number().optional(),
  polyline: z.object({ encodedPolyline: z.string() }).optional(),
  transitDetails: z
    .object({
      stopDetails: z.object({ departureStop: stop, arrivalStop: stop, departureTime: z.string().optional() }).optional(),
      headsign: z.string().optional(),
      stopCount: z.number().optional(),
      transitLine: z
        .object({
          name: z.string().optional(),
          nameShort: z.string().optional(),
          color: z.string().optional(),
          vehicle: z.object({ type: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
});
export const googleRoutesResponseSchema = z.object({
  routes: z.array(z.object({ duration: z.string().optional(), legs: z.array(z.object({ steps: z.array(stepSchema).optional() })).optional() })).optional(),
});

const seconds = (d: string | undefined) => Number(/^(\d+(?:\.\d+)?)s$/.exec(d ?? "")?.[1] ?? 0);
const minutes = (d: string | undefined) => Math.max(1, Math.round(seconds(d) / 60));

const MODES: Record<string, RideMode> = {
  SUBWAY: "subway",
  METRO_RAIL: "subway",
  HEAVY_RAIL: "subway",
  TRAM: "light_rail",
  LIGHT_RAIL: "light_rail",
  BUS: "bus",
  TROLLEYBUS: "bus",
  INTERCITY_BUS: "bus",
  COMMUTER_TRAIN: "rail",
  RAIL: "rail",
  FERRY: "ferry",
};
/** MBTA bus yellow, used when Google doesn't send a line color. */
const BUS_COLOR = "#FFC72C";

/** Google's route -> our TripPlan. Consecutive walking steps become one walk leg. */
export function parseGoogleRoute(body: unknown, to: LatLng & { name?: string }): TripPlan | null {
  const parsed = googleRoutesResponseSchema.safeParse(body);
  const route = parsed.success ? parsed.data.routes?.[0] : undefined;
  const steps = route?.legs?.flatMap((l) => l.steps ?? []) ?? [];
  if (!route || !steps.length) return null;

  const legs: TripLeg[] = [];
  const path: TripPath[] = [];
  for (const s of steps) {
    const points = s.polyline ? decodePolyline(s.polyline.encodedPolyline) : [];
    const t = s.transitDetails;
    if (s.travelMode === "TRANSIT" && t) {
      const mode = MODES[t.transitLine?.vehicle?.type ?? ""] ?? "other";
      const dep = t.stopDetails?.departureStop;
      const arr = t.stopDetails?.arrivalStop;
      const color = t.transitLine?.color || (mode === "bus" ? BUS_COLOR : "#8e8e93");
      // Riders know buses by number ("Bus 8"), not by Google's long name ("Harbor Point - Kenmore Station").
      const short = t.transitLine?.nameShort;
      const line = mode === "bus" && short ? `Bus ${short}` : t.transitLine?.name || (short ?? "Transit");
      const at = (x: typeof dep, fallback: LatLng) => ({
        name: x?.name ?? "Stop",
        lat: x?.location?.latLng.latitude ?? fallback.lat,
        lng: x?.location?.latLng.longitude ?? fallback.lng,
      });
      legs.push({
        kind: "ride",
        mode,
        line,
        short: t.transitLine?.nameShort || line.replace(/ Line$/, ""),
        color,
        from: at(dep, points[0] ?? to),
        to: at(arr, points[points.length - 1] ?? to),
        stops: t.stopCount ?? 1,
        minutes: minutes(s.staticDuration),
        ...(t.headsign ? { headsign: t.headsign } : {}),
        ...(t.stopDetails?.departureTime ? { departs: t.stopDetails.departureTime } : {}),
      });
      if (points.length) path.push({ color, walk: false, points });
      continue;
    }
    // Walking: merge with the previous walk leg, if any.
    const prevLeg = legs[legs.length - 1];
    const sec = seconds(s.staticDuration);
    if (prevLeg?.kind === "walk") {
      prevLeg.meters += s.distanceMeters ?? 0;
      prevLeg.minutes = Math.max(1, Math.round((prevLeg.minutes * 60 + sec) / 60));
    } else {
      legs.push({ kind: "walk", minutes: Math.max(1, Math.round(sec / 60)), meters: s.distanceMeters ?? 0, to: "" });
    }
    const prevPath = path[path.length - 1];
    if (prevPath?.walk) prevPath.points.push(...points);
    else if (points.length) path.push({ color: "#8e8e93", walk: true, points });
  }
  // Each walk leads to the next ride's first stop, or to the place at the end.
  legs.forEach((l, i) => {
    if (l.kind !== "walk") return;
    const next = legs[i + 1];
    l.to = next?.kind === "ride" ? next.from.name : (to.name ?? "the restaurant");
  });
  return { source: "google", minutes: minutes(route.duration), legs, path };
}

export class GoogleRoutesError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GoogleRoutesError";
  }
}

export async function googleTransitTrip(from: LatLng, to: LatLng & { name?: string }, apiKey: string, signal?: AbortSignal): Promise<TripPlan | null> {
  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      origin: point(from),
      destination: point(to),
      travelMode: "TRANSIT",
      transitPreferences: { allowedTravelModes: ["BUS", "SUBWAY", "TRAIN", "LIGHT_RAIL"] },
    }),
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new GoogleRoutesError(res.status, `Google Routes ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parseGoogleRoute(await res.json(), to);
}
