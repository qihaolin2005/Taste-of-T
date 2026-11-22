// Owner: P2 - Data & Integrations (see TEAM.md)
// "Search address or T station": Google Places Autocomplete (New) for Boston-area addresses,
// neighborhoods and landmarks, plus our own MBTA stations (free, no Google call). Picking a
// Google suggestion resolves it to the nearest T station: group members store a home *station*
// (RoomMember.homeStationId), which is what the planner routes to and checks the last train for.
// The address itself is never stored.
//
// Cost: autocomplete keystrokes and the one Place Details call that ends them share a session
// token, so Google bills the whole search as a single (Essentials) lookup.
// https://developers.google.com/maps/documentation/places/web-service/session-pricing
import { nearestStation, walkMinutes, type LatLng } from "@/lib/geo";
import { getStations, type StationRecord } from "@/lib/mbta/stations";
import { placesApiKey, PlacesUnavailableError } from "./google";

const BASE = "https://places.googleapis.com/v1";
/** Greater Boston, roughly the MBTA's subway and commuter-rail core. */
const BOSTON = { rectangle: { low: { latitude: 42.2, longitude: -71.3 }, high: { latitude: 42.55, longitude: -70.9 } } };
/** How far from a T station "home" can be and still be useful for routing home. */
export const HOME_MAX_METERS = 3000;

export type LocationSuggestion =
  | { kind: "station"; stationId: string; title: string; subtitle: string }
  | { kind: "place"; placeId: string; title: string; subtitle: string };

export type ResolvedHome = { stationId: string; stationName: string; label: string; walkMinutes: number };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, "").trim();

/** Our stations whose name contains every word typed ("harv sq" -> Harvard Square). */
export function matchStations(query: string, stations: readonly StationRecord[] = getStations(), limit = 4): LocationSuggestion[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return stations
    .filter((s) => words.every((w) => norm(s.name).includes(w)))
    .sort((a, b) => Number(!norm(a.name).startsWith(words[0])) - Number(!norm(b.name).startsWith(words[0])) || a.name.length - b.name.length)
    .slice(0, limit)
    .map((s) => ({ kind: "station", stationId: s.id, title: s.name, subtitle: `T station · ${s.lines.join(", ")}` }));
}

async function google<T>(url: string, init: RequestInit & { fieldMask?: string }): Promise<T> {
  const key = placesApiKey();
  if (!key) throw new PlacesUnavailableError("PLACES_API_KEY isn't set");
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", "x-goog-api-key": key, ...(init.fieldMask ? { "x-goog-fieldmask": init.fieldMask } : {}) },
    signal: AbortSignal.timeout(Number(process.env.PLACES_TIMEOUT_MS) || 5000),
    cache: "no-store",
  }).catch((err: Error) => {
    throw new PlacesUnavailableError(`Google Places request failed: ${err.message}`);
  });
  if (!res.ok) {
    const detail = await res.json().then((b) => b?.error?.message as string | undefined).catch(() => undefined);
    throw new PlacesUnavailableError(`Google Places ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

type AutocompleteAnswer = {
  suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } }[];
};

/** Boston-area addresses, neighborhoods and landmarks matching what was typed. */
export async function suggestPlaces(query: string, sessionToken: string): Promise<LocationSuggestion[]> {
  const body = { input: query, sessionToken, locationRestriction: BOSTON, includedRegionCodes: ["us"], languageCode: "en" };
  const json = await google<AutocompleteAnswer>(`${BASE}/places:autocomplete`, { method: "POST", body: JSON.stringify(body) });
  return (json.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction;
    if (!p?.placeId) return [];
    const title = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
    return title ? [{ kind: "place" as const, placeId: p.placeId, title, subtitle: p.structuredFormat?.secondaryText?.text ?? "" }] : [];
  });
}

/** Where a picked suggestion is, as the nearest T station (null if it's not near the T). */
export async function resolveHome(placeId: string, sessionToken: string, stations: readonly StationRecord[] = getStations()): Promise<ResolvedHome | null> {
  const q = new URLSearchParams({ sessionToken });
  const p = await google<{ displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }>(
    `${BASE}/places/${encodeURIComponent(placeId)}?${q}`,
    { method: "GET", fieldMask: "displayName,formattedAddress,location" },
  );
  if (!p.location) return null;
  return homeNear({ lat: p.location.latitude, lng: p.location.longitude }, p.displayName?.text ?? p.formattedAddress ?? "Home", stations);
}

export function homeNear(point: LatLng, label: string, stations: readonly StationRecord[] = getStations()): ResolvedHome | null {
  const near = nearestStation(point, stations, HOME_MAX_METERS);
  return near ? { stationId: near.station.id, stationName: near.station.name, label, walkMinutes: walkMinutes(point, near.station) } : null;
}
