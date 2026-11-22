// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// Browser helpers for claiming a visit: scan the receipt photo, get a GPS fix for the check-in.
// Client-only (no server imports). The server does every real check (proof.ts).

export type ScannedReceipt = {
  receipt: { merchantName: string; total: number; date: string; receiptNumber?: string; diners?: number };
  receiptToken: string;
  expiresAt: string;
};

/** Longest side after shrinking: plenty to read a receipt, small enough to upload fast on mobile data. */
const MAX_SIDE = 1600;

/** Phone photos are often 3-8 MB. Re-encode as a JPEG of at most MAX_SIDE px before uploading. */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file; // a format the browser can't decode: let the server say whether it's usable
  }
}

/** Uploads a receipt photo; resolves with what was read, or throws with a message to show. */
export async function scanReceiptPhoto(file: File): Promise<ScannedReceipt> {
  const form = new FormData();
  form.append("photo", await shrinkPhoto(file), "receipt.jpg");
  const r = await fetch("/api/rewards/receipt", { method: "POST", body: form });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error?.message ?? `Couldn't scan the receipt (${r.status})`);
  return body as ScannedReceipt;
}

export type Fix = { lat: number; lng: number; accuracyM: number };

/** A fresh, precise GPS fix for the check-in. Throws with a message to show if there isn't one. */
export function currentFix(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("This browser can't share your location, which is needed to check you in."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Allow location access to check in at the restaurant. Points are only for meals you claim while you're there."
              : "Couldn't get your location. Try again, ideally near a window or outside.",
          ),
        ),
      // maximumAge 0: an old fix from somewhere else must not count as being here now.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}
