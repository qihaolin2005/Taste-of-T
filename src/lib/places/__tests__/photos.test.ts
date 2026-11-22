import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Gemini is faked: tests say which thumbnails "show food".
const geminiFood = vi.hoisted(() => ({ answer: [] as number[], fail: false, calls: 0 }));
vi.mock("@/lib/places/foodPhotos", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/places/foodPhotos")>();
  return {
    ...real,
    findFoodPhotos: async (thumbs: unknown[]) => {
      geminiFood.calls++;
      if (geminiFood.fail) throw new Error("Gemini 503");
      return geminiFood.answer.filter((n) => n < thumbs.length);
    },
  };
});

import { foodFirst, parseFoodAnswer } from "@/lib/places/foodPhotos";
import { clearPhotoCache, isPhotoPlaceId, photoWidth, placeGallery, warmGallery } from "@/lib/places/photos";

const ID = "google:ChIJYXLO0UZ344kRR4-tRPELoyM";
const NOW = 1_000_000;
const PHOTOS = ["storefront", "sign", "noodles", "dining-room", "dumplings", "tea", "extra"].map((n) => ({
  name: `places/X/photos/${n}`,
  authorAttributions: [{ displayName: `By ${n}`, uri: `https://maps.google.com/contrib/${n}` }],
}));

/** Fake Google: details, photo media (URL names the photo + width), and the thumbnail bytes. */
function fakeGoogle(opts: { photos?: unknown[]; detailsStatus?: number } = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = String(url);
      calls.push(u);
      if (u.startsWith("https://lh3.googleusercontent.com/")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
      const media = /photos\/([^/]+)\/media\?maxWidthPx=(\d+)/.exec(u);
      if (media) return Response.json({ photoUri: `https://lh3.googleusercontent.com/${media[1]}=w${media[2]}` });
      if (opts.detailsStatus) return new Response("nope", { status: opts.detailsStatus });
      return Response.json({ photos: opts.photos ?? PHOTOS });
    }),
  );
  return calls;
}

describe("food photos first", () => {
  it("parses Gemini's answer, dropping junk and out-of-range numbers", () => {
    expect(parseFoodAnswer('{"foodPhotos":[2,4,4,9,-1,1.5]}', 6)).toEqual([2, 4]);
    expect(parseFoodAnswer("not json", 6)).toEqual([]);
    expect(parseFoodAnswer('{"foodPhotos":"2"}', 6)).toEqual([]);
  });

  it("moves food to the front and keeps Google's order within each group", () => {
    expect(foodFirst(["a", "b", "c", "d"], [3, 1])).toEqual({ items: ["b", "d", "a", "c"], food: [true, true, false, false] });
    expect(foodFirst(["a", "b"], [])).toEqual({ items: ["a", "b"], food: [false, false] });
  });
});

describe("place photo gallery", () => {
  beforeEach(() => {
    vi.stubEnv("PLACES_API_KEY", "test-key");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    Object.assign(geminiFood, { answer: [2, 4, 5], fail: false, calls: 0 });
    clearPhotoCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const names = (photos: { url: string }[]) => photos.map((p) => p.url.split("/").pop());

  it("only Google places have photos, and widths snap to a few sizes", () => {
    expect(isPhotoPlaceId(ID)).toBe(true);
    for (const bad of ["seed-ct-lantern", "google:", "google:../../secrets"]) expect(isPhotoPlaceId(bad)).toBe(false);
    expect([100, 320, 321, 640, 900, 1600].map(photoWidth)).toEqual([320, 320, 640, 640, 960, 960]);
  });

  it("returns the whole gallery in one go: up to 6 photos, dishes first, each with its credit", async () => {
    fakeGoogle();
    const photos = await placeGallery(ID, 640, NOW);
    expect(names(photos)).toEqual(["noodles=w640", "dumplings=w640", "tea=w640", "storefront=w640", "sign=w640", "dining-room=w640"]);
    expect(photos.map((p) => p.food)).toEqual([true, true, true, false, false, false]);
    expect(photos[0].credit).toEqual({ name: "By noodles", uri: "https://maps.google.com/contrib/noodles" });
    expect(geminiFood.calls).toBe(1); // one Gemini request per place
  });

  it("asks Google once per place and size, and again after 30 minutes", async () => {
    const calls = fakeGoogle();
    await placeGallery(ID, 640, NOW);
    const first = calls.length; // details + 6 thumbnails (+ bytes) + 6 display URLs
    await placeGallery(ID, 600, NOW + 60_000); // same 640 size: all cached
    expect(calls.length).toBe(first);
    await placeGallery(ID, 960, NOW + 60_000); // a new size: 6 new URLs, no new lookup or sort
    expect(calls.length).toBe(first + 6);
    expect(geminiFood.calls).toBe(1);
    await placeGallery(ID, 640, NOW + 31 * 60_000);
    expect(calls.length).toBeGreaterThan(first + 6);
  });

  it("warming starts the work early, so the real request reuses it", async () => {
    const calls = fakeGoogle();
    warmGallery(ID);
    warmGallery("seed-ct-lantern"); // no Google id: nothing to do
    await vi.waitFor(() => expect(geminiFood.calls).toBe(1));
    await vi.waitFor(() => expect(calls.filter((u) => u.includes("maxWidthPx=640"))).toHaveLength(6));
    const before = calls.length;
    await placeGallery(ID, 640);
    expect(calls.length).toBe(before);
  });

  it("keeps Google's order without a Gemini key, or if Gemini fails", async () => {
    fakeGoogle();
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(names(await placeGallery(ID, 640, NOW))[0]).toBe("storefront=w640");
    expect(geminiFood.calls).toBe(0);

    clearPhotoCache();
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    geminiFood.fail = true;
    expect(names(await placeGallery(ID, 640, NOW))[0]).toBe("storefront=w640");
  });

  it("no photos for places without them, seed places, or without a Places key", async () => {
    fakeGoogle({ photos: [] });
    expect(await placeGallery(ID, 640, NOW)).toEqual([]);
    expect(await placeGallery("seed-ct-lantern", 640, NOW)).toEqual([]);
    vi.stubEnv("PLACES_API_KEY", "");
    clearPhotoCache();
    expect(await placeGallery(ID, 640, NOW)).toEqual([]);
  });

  it("a failed lookup throws and isn't cached, so the next view retries", async () => {
    fakeGoogle({ detailsStatus: 403 });
    await expect(placeGallery(ID, 640, NOW)).rejects.toThrow(/403/);
    fakeGoogle();
    expect(await placeGallery(ID, 640, NOW)).toHaveLength(6);
  });
});
