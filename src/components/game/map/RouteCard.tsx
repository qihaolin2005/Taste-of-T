// Owner: P4 - Game Layer & Map (see TEAM.md)
// Under the T map when it's showing a route to a place: total time, then each step
// (walk / ride the Red Line 5 stops / take bus 1), plus full directions in Google Maps.
"use client";

import type { LatLng } from "@/lib/geo";
import { googleMapsDirectionsUrl, type RideLeg, type TripPlan } from "@/features/directions/types";

export type RouteState =
  | { status: "locating" }
  | { status: "loading" }
  | { status: "ready"; plan: TripPlan | null }
  | { status: "error"; message: string };

const MODE_WORD: Record<RideLeg["mode"], string> = { subway: "", light_rail: "", bus: "", rail: "train", ferry: "ferry", other: "" };

/** True for light colors (like bus yellow) that need dark text on top. */
function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

function Badge({ leg }: { leg: RideLeg }) {
  const light = isLight(leg.color);
  return (
    <span className="inline-flex min-w-9 items-center justify-center rounded-[7px] px-1.5 py-0.5 text-[13px] font-bold" style={{ background: leg.color, color: light ? "#1c1c1e" : "#fff" }}>
      {leg.mode === "bus" && !/^bus/i.test(leg.short) ? `Bus ${leg.short}` : leg.short}
    </span>
  );
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function RouteCard({ to, me, state, onRetry }: { to: LatLng & { name?: string; placeId?: string }; me: LatLng | null; state: RouteState; onRetry: () => void }) {
  const gmaps = googleMapsDirectionsUrl(to, me);
  const name = to.name ?? "the restaurant";

  return (
    <section className="mt-3 overflow-hidden rounded-[14px] bg-cell">
      <div className="border-b-[0.5px] border-separator px-4 py-3">
        <p className="text-[13px] text-label-2">Route to</p>
        <p className="text-[17px] font-semibold">{name}</p>
        {state.status === "ready" && state.plan && (
          <p className="mt-0.5 text-[15px] text-label-2">
            About <span className="font-semibold text-label">{state.plan.minutes} min</span>
            {state.plan.source === "google" ? " · live T and bus times" : " · estimated, subway only"}
          </p>
        )}
      </div>

      {state.status === "locating" && <p className="px-4 py-3 text-[15px] text-label-2">Finding where you are…</p>}
      {state.status === "loading" && <p className="px-4 py-3 text-[15px] text-label-2">Planning your route…</p>}
      {state.status === "error" && (
        <div className="px-4 py-3">
          <p className="text-[15px] text-label-2">{state.message}</p>
          <button type="button" onClick={onRetry} className="mt-1 text-[15px] font-semibold text-tint active:opacity-60">
            Try again
          </button>
        </div>
      )}
      {state.status === "ready" && !state.plan && (
        <p className="px-4 py-3 text-[15px] text-label-2">There&apos;s no T stop within walking distance of you. Google Maps can plan a bus or train trip.</p>
      )}

      {state.status === "ready" && state.plan && (
        <ol className="px-4 py-1">
          {state.plan.legs.map((leg, i) => (
            <li key={i} className="flex items-start gap-3 border-b-[0.5px] border-separator py-2.5 last:border-b-0">
              {leg.kind === "walk" ? (
                <>
                  <span className="inline-flex min-w-9 items-center justify-center rounded-[7px] bg-cell-2 px-1.5 py-0.5 text-[13px] font-bold text-label-2">Walk</span>
                  <span className="flex-1 text-[15px] leading-5">
                    Walk to <span className="font-semibold">{leg.to || name}</span>
                    <span className="block text-[13px] text-label-2">
                      {leg.minutes} min{leg.meters ? ` · ${leg.meters >= 1000 ? `${(leg.meters / 1609).toFixed(1)} mi` : `${Math.round(leg.meters / 10) * 10} m`}` : ""}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <Badge leg={leg} />
                  <span className="flex-1 text-[15px] leading-5">
                    {leg.line}
                    {MODE_WORD[leg.mode] ? ` ${MODE_WORD[leg.mode]}` : ""} from <span className="font-semibold">{leg.from.name}</span> to <span className="font-semibold">{leg.to.name}</span>
                    <span className="block text-[13px] text-label-2">
                      {[leg.headsign ? `Toward ${leg.headsign}` : null, `${leg.stops} stop${leg.stops === 1 ? "" : "s"}`, `${leg.minutes} min`, leg.departs ? `leaves ${time(leg.departs)}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      <a href={gmaps} target="_blank" rel="noopener noreferrer" className="block border-t-[0.5px] border-separator px-4 py-3 text-center text-[15px] font-semibold text-tint active:bg-cell-2">
        Open in Google Maps
      </a>
    </section>
  );
}
