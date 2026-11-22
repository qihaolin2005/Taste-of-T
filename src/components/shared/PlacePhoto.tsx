// Owner: P2 - Data & Integrations (see TEAM.md)
// A restaurant's photo gallery (GET /api/places/photo), food photos first, with the photographer
// credit Google requires. ‹ › arrows and dots go through up to 6 photos. The whole gallery comes
// in one request and the next image is preloaded, so flipping is instant. Shows a soft
// placeholder while loading, and nothing if the place has no photos.
"use client";

import { useEffect, useState, type MouseEvent, type PointerEvent } from "react";

type Photo = { url: string; credit: { name: string; uri?: string } | null; food: boolean };

/** One request per place and size, shared by every PlacePhoto on the page. */
const galleries = new Map<string, Promise<Photo[]>>();

function loadGallery(placeId: string, width: number): Promise<Photo[]> {
  const k = `${placeId}|${width}`;
  let p = galleries.get(k);
  if (!p) {
    p = fetch(`/api/places/photo?${new URLSearchParams({ placeId, w: String(width) })}`)
      .then((r) => (r.ok ? r.json() : { photos: [] }))
      .then((b: { photos?: Photo[] }) => b.photos ?? [])
      .catch(() => []);
    // Failed or empty answers aren't remembered, so a later view can try again.
    p.then((photos) => !photos.length && galleries.delete(k));
    galleries.set(k, p);
  }
  return p;
}

/** Warm the browser's image cache so showing a photo is instant. */
const preload = (url: string | undefined) => {
  if (url) new Image().src = url;
};

/** Only Google places have photos; skip the request for anything else (demo seed places). */
const hasPhoto = (placeId: string | null | undefined): placeId is string => !!placeId && placeId.startsWith("google:");

/** Start loading a place's photos before it's on screen (e.g. the next swipe cards). */
export function prefetchPlacePhotos(placeId: string | null | undefined, width = 640): void {
  if (hasPhoto(placeId)) loadGallery(placeId, width).then((photos) => preload(photos[0]?.url));
}

/** Keep taps on the controls from reaching a swipeable card underneath. */
const stop = (e: PointerEvent | MouseEvent) => e.stopPropagation();

function Arrow({ dir, onClick, label }: { dir: "left" | "right"; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={stop}
      onClick={(e) => {
        stop(e);
        onClick();
      }}
      className={`absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm active:scale-95 ${dir === "left" ? "left-2" : "right-2"}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir === "left" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
      </svg>
    </button>
  );
}

export default function PlacePhoto({
  placeId,
  alt,
  width = 640,
  className = "h-44 w-full",
  priority = false,
}: {
  placeId: string | null | undefined;
  alt: string;
  /** Pixels wide to ask Google for (snapped to 320 / 640 / 960). */
  width?: number;
  /** Size and corners. The photo covers the box. */
  className?: string;
  /** Above the fold (a result card): load the first image right away instead of lazily. */
  priority?: boolean;
}) {
  const key = `${placeId}|${width}`;
  const [loaded, setLoaded] = useState<{ key: string; photos: Photo[] } | null>(null);
  const [view, setView] = useState({ key, index: 0 });
  const index = view.key === key ? view.index : 0; // a new place starts at its first photo
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!hasPhoto(placeId)) return;
    let live = true;
    loadGallery(placeId, width).then((photos) => {
      if (!live) return;
      setLoaded({ key, photos });
      preload(photos[1]?.url); // the next photo is ready before the first arrow tap
    });
    return () => {
      live = false;
    };
  }, [placeId, width, key]);

  if (!hasPhoto(placeId)) return null;
  if (loaded?.key !== key) return <div className={`animate-pulse bg-cell-2 ${className}`} aria-hidden />;
  const photos = loaded.photos.filter((p) => !broken.has(p.url));
  if (!photos.length) return null;

  const count = photos.length;
  const i = Math.min(index, count - 1);
  const photo = photos[i];
  const go = (d: number) => {
    const next = (i + d + count) % count;
    setView({ key, index: next });
    preload(photos[(next + d + count) % count]?.url); // and the one after, in the same direction
  };

  return (
    <div className={`relative overflow-hidden bg-cell-2 ${className}`} aria-roledescription={count > 1 ? "carousel" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Google's photo URL; sizes vary and next/image would need its domains configured */}
      <img
        key={photo.url}
        src={photo.url}
        alt={count > 1 ? `${alt}, photo ${i + 1} of ${count}` : alt}
        loading={priority && i === 0 ? "eager" : "lazy"}
        fetchPriority={priority && i === 0 ? "high" : "auto"}
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        className="h-full w-full select-none object-cover"
        onError={() => setBroken((s) => new Set(s).add(photo.url))}
      />
      {count > 1 && (
        <>
          <Arrow dir="left" label="Previous photo" onClick={() => go(-1)} />
          <Arrow dir="right" label="Next photo" onClick={() => go(1)} />
          <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.map((p, n) => (
              <span key={p.url} className={`size-1.5 rounded-full ${n === i ? "bg-white" : "bg-white/50"}`} />
            ))}
          </div>
        </>
      )}
      {photo.credit && (
        <span className="absolute right-2 top-2 max-w-[60%] truncate rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur-sm">
          Photo:{" "}
          {photo.credit.uri ? (
            <a href={photo.credit.uri} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline" onPointerDown={stop} onClick={stop}>
              {photo.credit.name}
            </a>
          ) : (
            photo.credit.name
          )}
        </span>
      )}
    </div>
  );
}
