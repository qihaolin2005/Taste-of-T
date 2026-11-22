// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET /api/places/photo?placeId=google:ChIJ...&w=640
//     -> 200 { photos: [{ url, credit: { name, uri? } | null, food }] }   (food photos first; [] if none)
// A restaurant's whole photo gallery in one answer, for Spin, group cards and the T map.
// The URLs are Google's (no API key in them); show each `credit` with its photo, as Google
// requires. See src/lib/places/photos.ts.
import { apiError } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { isPhotoPlaceId, placeGallery } from "@/lib/places/photos";

const none = (cache: string) => Response.json({ photos: [] }, { headers: { "cache-control": cache } });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const placeId = url.searchParams.get("placeId") ?? "";
  const width = Math.min(1600, Math.max(100, Number(url.searchParams.get("w")) || 640));
  if (!isPhotoPlaceId(placeId)) return none("private, max-age=3600");
  // New places are paid Google lookups (cached 30 min after that): plenty for browsing.
  if (!rateLimit(`place-photo:${clientIp(req)}`, 150, 10 * 60_000)) return apiError("too_many_requests", "Too many photos at once. Try again in a bit.");
  try {
    const photos = await placeGallery(placeId, width);
    return Response.json({ photos }, { headers: { "cache-control": "private, max-age=600" } });
  } catch (err) {
    console.error("place photos failed:", (err as Error).message);
    return none("no-store");
  }
}
