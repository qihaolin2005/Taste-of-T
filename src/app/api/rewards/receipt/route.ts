// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
//   POST /api/rewards/receipt   multipart form: photo=<image file>, placeId? (the place being claimed)
//     -> 200 { receipt: { merchantName, total, date, receiptNumber?, diners? }, receiptToken, expiresAt }
//     -> 422 { error } when the photo isn't a readable receipt; 503 when scanning isn't configured
// Reads a receipt photo with Gemini and returns the facts plus a signed token to send with the
// claim (POST /api/rewards/visits). The photo is not stored. See src/features/rewards/receiptOcr.ts.
// DEMO_RECEIPTS=1 (demo only): any photo passes, as a made-up receipt from `placeId`'s restaurant.
import { apiError } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/requireUser";
import { sessionSecret } from "@/lib/sessionToken";
import { signReceipt } from "@/features/rewards";
import { googlePlacesEnabled, listRestaurants } from "@/lib/places";
import { loadRestaurants } from "@/features/ml";
import {
  demoReceiptFacts,
  demoReceipts,
  geminiErrorStatus,
  RECEIPT_IMAGE_TYPES,
  receiptScanEnabled,
  scanReceipt,
  type ReceiptImageType,
} from "@/features/rewards/receiptOcr";

/** The client shrinks photos before upload; this is a hard stop well under the API's image limit. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!receiptScanEnabled()) return apiError("unavailable", "Receipt scanning isn't set up on this server.");
  // Each scan is a paid API call: a few retakes are fine, a loop isn't.
  if (!rateLimit(`receipt-scan:${auth.userId}`, 12, 60 * 60_000)) return apiError("too_many_requests", "Too many receipt scans. Try again in a bit.");

  let photo: FormDataEntryValue | null;
  let placeId: string | null = null;
  try {
    const form = await req.formData();
    photo = form.get("photo");
    const p = form.get("placeId");
    placeId = typeof p === "string" && p.length <= 200 ? p : null;
  } catch {
    return apiError("bad_request", "Send the photo as multipart form data (field: photo).");
  }
  if (!(photo instanceof File)) return apiError("bad_request", "Missing the photo.");

  // DEMO ONLY: any picture is a receipt from the restaurant being claimed (no Gemini call).
  if (demoReceipts()) {
    const { places } = await loadRestaurants(googlePlacesEnabled() ? listRestaurants : null);
    const facts = demoReceiptFacts(places.find((p) => p.id === placeId)?.name ?? null);
    const { token, expiresAt } = signReceipt(auth.userId, facts, sessionSecret());
    return Response.json({ receipt: facts, receiptToken: token, expiresAt }, { headers: { "cache-control": "no-store" } });
  }

  if (!RECEIPT_IMAGE_TYPES.includes(photo.type as ReceiptImageType)) return apiError("bad_request", "The photo must be a JPEG, PNG, WebP or GIF.");
  if (photo.size === 0 || photo.size > MAX_BYTES) return apiError("bad_request", "The photo must be under 4 MB.");

  try {
    const result = await scanReceipt({ data: Buffer.from(await photo.arrayBuffer()), mediaType: photo.type as ReceiptImageType });
    if ("error" in result) {
      return Response.json({ error: { code: result.error.code, message: result.error.message } }, { status: 422 });
    }
    const { token, expiresAt } = signReceipt(auth.userId, result.facts, sessionSecret());
    return Response.json({ receipt: result.facts, receiptToken: token, expiresAt }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    // Gemini SDK errors carry the HTTP status. The free tier's limits show up as 429s.
    const status = geminiErrorStatus(err);
    if (status === 429) return apiError("too_many_requests", "Receipt scanning is busy. Try again in a minute.");
    if (status === 400 || status === 401 || status === 403) {
      console.error(`receipt scan: Gemini rejected the request (${status}). Check GEMINI_API_KEY and the model name.`, (err as Error).message);
      return apiError("unavailable", "Receipt scanning isn't working right now.");
    }
    console.error("receipt scan failed:", (err as Error)?.message ?? err);
    return apiError("unavailable", "Couldn't scan the receipt right now. Try again.");
  }
}
