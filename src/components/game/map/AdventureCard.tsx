// Owner: P4 - Game Layer & Map (see TEAM.md)
// Under the T map during a group adventure: where you're all going, who's on the way, who made it.
"use client";

import Link from "next/link";
import type { Adventure } from "./adventure";

export default function AdventureCard({ adventure }: { adventure: Adventure }) {
  const { code, destination, crew, arrived, onTheWay } = adventure;
  const summary = crew.length
    ? [onTheWay ? `${onTheWay} on the way` : null, arrived ? `${arrived} arrived` : null].filter(Boolean).join(" · ") || "Trips finished"
    : "Nobody's left yet";
  return (
    <section className="mt-3 rounded-[10px] bg-cell px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[13px] text-label-2">Group adventure{destination?.name ? " to" : ""}</span>
          <span className="block truncate text-[17px] font-semibold">{destination?.name ?? "Your group"}</span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-label-2">
          {onTheWay > 0 && <span className="size-2 animate-pulse rounded-full bg-[#34c759]" />}
          {summary}
        </span>
      </div>

      {crew.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {crew.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 text-[14px]">
              <span className="block size-3 rounded-full border-2 border-white shadow" style={{ background: c.color }} />
              <span className="font-medium">{c.label}</span>
              <span className="text-label-2">{c.live ? (c.at ? "on the way" : "starting…") : c.arrived ? "arrived" : "finished"}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[12px] text-label-3">Live paths update every 10 s. Thick lines are bus/T, thin lines are walking.</p>
      {/* The Trip Map unlocks once there's a place to eat (src/components/trips/tripMapAccess.ts). */}
      {destination ? (
        <Link href={`/room/${code}/trips`} className="mt-2 block text-[15px] font-semibold text-tint">
          {crew.some((c) => c.you) ? "Open the group Trip Map" : "Start your trip"}
        </Link>
      ) : (
        <p className="mt-2 text-[14px] text-label-2">The Trip Map unlocks once your group picks a place to eat.</p>
      )}
    </section>
  );
}
