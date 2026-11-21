// Owner: P2 - Data & Integrations (see TEAM.md)
// Thin client for Google Places API (New): Nearby Search and Text Search.
// https://developers.google.com/maps/documentation/places/web-service/op-overview
//
// Uses PLACES_API_KEY: a SERVER-ONLY key restricted to "Places API (New)". Don't reuse the
// browser Maps key: it's public, and referrer-restricted keys don't work from a server anyway.
import type { LatLng } from "@/lib/geo";
import type { GooglePlace } from "./googleMapping";

const BASE = "https://places.googleapis.com/v1";

/**
 * Only these fields are requested. Google bills each request at the tier of the most expensive
 * field asked for: rating/price/hours are "Enterprise", servesVegetarianFood is
 * "Enterprise + Atmosphere". We need them for budgets, closing times, and diets.
 */
export const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.formattedAddress",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.priceRange",
  "places.regularOpeningHours",
  "places.servesVegetarianFood",
].join(",");

export class PlacesUnavailableError extends Error {}

export function placesApiKey(): string | null {
  return process.env.PLACES_API_KEY || null;
}

type Common = { center: LatLng; radiusM: number; maxResults?: number; signal?: AbortSignal };

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<GooglePlace[]> {
  const key = placesApiKey();
  if (!key) throw new PlacesUnavailableError("PLACES_API_KEY isn't set");
  const timeout = AbortSignal.timeout(Number(process.env.PLACES_TIMEOUT_MS) || 5000);
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": FIELD_MASK },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    });
  } catch (err) {
    throw new PlacesUnavailableError(`Google Places request failed: ${(err as Error).message}`);
  }
  if (!res.ok) {
    // Google explains the problem in error.message (bad key, API not enabled, quota...).
    const detail = await res.json().then((b) => b?.error?.message as string | undefined).catch(() => undefined);
    throw new PlacesUnavailableError(`Google Places ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  const json = (await res.json()) as { places?: GooglePlace[] };
  return json.places ?? [];
}

const circle = (c: LatLng, radiusM: number) => ({ circle: { center: { latitude: c.lat, longitude: c.lng }, radius: radiusM } });

/** Places of the given Google types within radiusM of center (max 20 per request). */
export function searchNearby(opts: Common & { includedTypes: string[] }): Promise<GooglePlace[]> {
  return post(
    "places:searchNearby",
    { includedTypes: opts.includedTypes, maxResultCount: Math.min(20, opts.maxResults ?? 20), locationRestriction: circle(opts.center, opts.radiusM) },
    opts.signal,
  );
}

/** Free-text search ("dumplings", "karaoke") biased to radiusM around center. */
export function searchText(opts: Common & { query: string; includedType?: string }): Promise<GooglePlace[]> {
  return post(
    "places:searchText",
    {
      textQuery: opts.query,
      pageSize: Math.min(20, opts.maxResults ?? 20),
      locationBias: circle(opts.center, opts.radiusM),
      ...(opts.includedType ? { includedType: opts.includedType } : {}),
    },
    opts.signal,
  );
}
