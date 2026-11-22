// Owner: P4 - Game Layer & Map (see TEAM.md)
// The rows of "Trending Right Now". Tap a row: the place on the T map with the route there.
// Tap the chevron: expand the row to see the place's photo (loaded only when expanded).
"use client";

import Link from "next/link";
import { useState } from "react";
import PlacePhoto from "@/components/shared/PlacePhoto";
import { routeMapHref } from "@/features/directions/types";
import type { TrendingPlace } from "@/features/trending";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

function FlameIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2c.5 3.2-1.4 5-2.9 6.6C7.6 10.2 6 11.9 6 14.6A6 6 0 0 0 12 21a6 6 0 0 0 6-6.2c0-2.3-1-4.1-2.3-5.6-.2 1.5-.9 2.6-2 3.2.3-3.6-.6-7.4-1.7-10.4Z" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function TrendingList({ items, activeId }: { items: TrendingPlace[]; activeId: string | null }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Rows only: the surrounding card comes from ListSection.
  return (
    <>
      {items.map((t, i) => {
        const isOpen = open.has(t.id);
        const isActive = t.id === activeId;
        const detail = [t.neighborhood, t.cuisines[0] ? cap(t.cuisines[0]) : null].filter(Boolean).join(" · ");
        const href = routeMapHref(t)!;
        return (
          <div key={t.id} className="ios-row">
            <div className="flex items-center">
              <Link href={href} className="flex min-w-0 flex-1 items-center active:bg-cell-2">
                <span className="ml-4 flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-lavender text-plum">
                  {t.buzzing ? <FlameIcon /> : <span className="text-[14px] font-bold">{i + 1}</span>}
                </span>
                <span className="ios-row-body ml-3 flex min-h-[60px] min-w-0 flex-1 flex-col justify-center py-3 pr-2">
                  <span className="block truncate text-[16px] font-semibold leading-[22px]">
                    {t.name}
                    {isActive && <span className="ml-1.5 text-[13px] font-semibold text-tint">On the map</span>}
                  </span>
                  <span className="block truncate text-[14px] leading-5 text-label-2">{detail ? `${t.why} · ${detail}` : t.why}</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => toggle(t.id)}
                aria-expanded={isOpen}
                aria-label={isOpen ? `Hide photo of ${t.name}` : `Show photo of ${t.name}`}
                className="mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-label-3 active:bg-cell-2"
              >
                <Chevron open={isOpen} />
              </button>
            </div>
            {isOpen && (
              <div className="px-4 pb-4">
                <PlacePhoto placeId={t.id} alt={t.name} className="h-48 w-full rounded-[14px]" />
                <Link href={href} className="mt-2 block text-center text-[14px] font-semibold text-tint active:opacity-60">
                  {isActive ? "Showing on the map above" : "Show on the map & how to get there"}
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
