// Owner: P2 - Data & Integrations (see TEAM.md)
// A restaurant's photo gallery from Google Places (New), by our place id ("google:<Google id>").
//   1. Place Details with only the `photos` field -> up to 6 photo names + their authors
//   2. At the same time:
//      - the display-size URLs for all of them (Photo media with skipHttpRedirect)
//      - food first: Gemini looks at small thumbnails and the dish/drink photos move to the
//        front (foodPhotos.ts). Google's first photo is usually the storefront.
// The whole gallery comes back in one answer, so flipping through it never waits on the server.
// warmGallery() starts all this early (when Spin picks a place, when the map lists trending
// places), so it's usually ready before anyone looks.
// The browser loads Google's URLs directly, so the API key never leaves the server. Google requires
// showing each photo's author, so the credit comes back too. Everything is kept in memory for
// 30 min (Google photo names and URLs expire, so nothing is stored longer).
// Demo seed places have no Google id, so they have no photos.
import { findFoodPhotos, foodFirst, foodSortEnabled } from "./foodPhotos";
import { placesApiKey } from "./google";

export type Credit = { name: string; uri?: string };
export type PlacePhoto = { url: string; credit: Credit | null; /** Gemini saw food in it. */ food: boolean };

const BASE = "https://places.googleapis.com/v1";
const GOOGLE_ID = /^google:([A-Za-z0-9_-]{10,300})$/;
const TTL_MS = 30 * 60_000;
const MAX_ENTRIES = 1000;
export const GALLERY_MAX = 6;
/** Snap requested widths to a few sizes so the cache gets hits. */
const WIDTHS = [320, 640, 960];
/** Thumbnails Gemini looks at to find the food photos (also reused for 320 px views). */
const THUMB_W = 320;

type Item = { name: string; credit: Credit | null };
type Entry<T> = { at: number; value: Promise<T> };

/**
 * Google's photo list per place, the food-first order per place, and photo URLs per size.
 * Kept on globalThis: Next bundles pages and API routes separately, each with its own copy of
 * this module, and warming from the map page must fill the same cache the photo API reads.
 */
type Caches = { lists: Map<string, Entry<Item[]>>; orders: Map<string, Entry<{ order: number[]; food: boolean[] }>>; urls: Map<string, Entry<string | null>> };
const shared = globalThis as typeof globalThis & { __totPlacePhotos?: Caches };
const { lists, orders, urls } = (shared.__totPlacePhotos ??= { lists: new Map(), orders: new Map(), urls: new Map() });

export function isPhotoPlaceId(placeId: string): boolean {
  return GOOGLE_ID.test(placeId);
}

export function photoWidth(requested: number): number {
  return WIDTHS.find((w) => w >= requested) ?? WIDTHS[WIDTHS.length - 1];
}

/** Cached promise: reused for 30 min; a failure isn't kept, so the next view retries. */
function cached<T>(map: Map<string, Entry<T>>, k: string, now: number, load: () => Promise<T>): Promise<T> {
  const hit = map.get(k);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const value = load();
  map.set(k, { at: now, value });
  value.catch(() => map.delete(k));
  if (map.size > MAX_ENTRIES) for (const [key, e] of map) if (now - e.at >= TTL_MS || map.size > MAX_ENTRIES) map.delete(key);
  return value;
}

function photoUrl(name: string, width: number, key: string, now: number): Promise<string | null> {
  return cached(urls, `${name}|${width}`, now, async () => {
    const r = await fetch(`${BASE}/${name}/media?maxWidthPx=${width}&skipHttpRedirect=true`, { headers: { "X-Goog-Api-Key": key }, signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!r.ok) throw new Error(`Place Photo ${r.status}`);
    return ((await r.json()) as { photoUri?: string }).photoUri ?? null;
  });
}

type Details = { photos?: { name?: string; authorAttributions?: { displayName?: string; uri?: string }[] }[] };

function photoList(googleId: string, key: string, now: number): Promise<Item[]> {
  return cached(lists, googleId, now, async () => {
    const res = await fetch(`${BASE}/places/${googleId}`, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos" }, signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!res.ok) throw new Error(`Place Details ${res.status}`);
    return (((await res.json()) as Details).photos ?? [])
      .filter((p): p is { name: string; authorAttributions?: { displayName?: string; uri?: string }[] } => !!p.name)
      .slice(0, GALLERY_MAX)
      .map((p) => {
        const a = p.authorAttributions?.[0];
        return { name: p.name, credit: a?.displayName ? { name: a.displayName, ...(a.uri ? { uri: a.uri } : {}) } : null };
      });
  });
}

/** Food photos first (Gemini on small thumbnails). Never throws: falls back to Google's order. */
function foodOrder(googleId: string, items: Item[], key: string, now: number) {
  const googleOrder = { order: items.map((_, i) => i), food: items.map(() => false) };
  if (items.length < 2 || !foodSortEnabled()) return Promise.resolve(googleOrder);
  return cached(orders, googleId, now, async () => {
    try {
      const thumbs = await Promise.all(
        items.map((it) =>
          photoUrl(it.name, THUMB_W, key, now)
            .then(async (url) => {
              if (!url) return null;
              const img = await fetch(url, { signal: AbortSignal.timeout(6000) });
              return img.ok ? { data: Buffer.from(await img.arrayBuffer()), mimeType: img.headers.get("content-type")?.split(";")[0] || "image/jpeg" } : null;
            })
            .catch(() => null),
        ),
      );
      const sent = thumbs.flatMap((t, i) => (t ? [{ t, i }] : []));
      const food = (await findFoodPhotos(sent.map((s) => s.t))).map((n) => sent[n].i);
      const sorted = foodFirst(items.map((_, i) => i), food);
      return { order: sorted.items, food: sorted.food };
    } catch (err) {
      console.error("food photo sort failed, keeping Google's order:", (err as Error).message);
      return googleOrder;
    }
  });
}

/** The place's gallery (food first) at about `width` px: up to 6 photos, or [] if none. */
export async function placeGallery(placeId: string, width = 640, now = Date.now()): Promise<PlacePhoto[]> {
  const id = GOOGLE_ID.exec(placeId)?.[1];
  const key = placesApiKey();
  if (!id || !key) return [];
  const items = await photoList(id, key, now);
  if (!items.length) return [];
  const w = photoWidth(width);
  // Display URLs and the food sort run at the same time.
  const [shown, { order, food }] = await Promise.all([
    Promise.all(items.map((it) => photoUrl(it.name, w, key, now).catch(() => null))),
    foodOrder(id, items, key, now),
  ]);
  return order.flatMap((i, pos) => (shown[i] ? [{ url: shown[i]!, credit: items[i].credit, food: food[pos] }] : []));
}

/** Start loading a place's gallery now, so it's ready when someone looks. Fire and forget. */
export function warmGallery(placeId: string | null | undefined, width = 640): void {
  if (placeId && isPhotoPlaceId(placeId)) placeGallery(placeId, width).catch(() => {});
}

/** For tests. */
export function clearPhotoCache(): void {
  lists.clear();
  orders.clear();
  urls.clear();
}
