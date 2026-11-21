// Owner: P4 - Game Layer & Map (see TEAM.md)
// Interactive T map: real MBTA lines + stations, live trains, your stamps.
// Uses Google Maps when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set and loads; otherwise (no key,
// bad key, offline) the SVG map drawn from the same MBTA snapshot. The demo never breaks.
"use client";

import { useCallback, useMemo, useState } from "react";
import { distanceMeters, walkMinutes } from "@/lib/geo";
import type { LineRecord, StationRecord } from "@/lib/mbta/stations";
import GoogleTMap, { hasGoogleMapsKey } from "./map/GoogleTMap";
import SvgTMap from "./map/SvgTMap";
import StationCard from "./map/StationCard";
import { useLiveTrains, useMyLocation, useStampedStations } from "./map/hooks";
import { decodeLines, FAMILIES, familyOf } from "./map/model";

type Props = { stations: readonly StationRecord[]; lines: readonly LineRecord[] };

function LocateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.6 3.4 3.9 10.2c-.8.3-.7 1.5.1 1.7l6.6 1.5 1.5 6.6c.2.8 1.4.9 1.7.1l6.8-16.7Z" />
    </svg>
  );
}

function TrainToggleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="3" width="14" height="14" rx="3.5" />
      <path d="M5 10.5h14M8.5 21l1.5-4M15.5 21 14 17" strokeLinecap="round" />
    </svg>
  );
}

export default function TMap({ stations, lines }: Props) {
  const drawn = useMemo(() => decodeLines(lines), [lines]);
  const [googleFailed, setGoogleFailed] = useState(false);
  const onGoogleFail = useCallback(() => setGoogleFailed(true), []);
  const useGoogle = hasGoogleMapsKey && !googleFailed;

  const [showTrains, setShowTrains] = useState(true);
  const trains = useLiveTrains(showTrains);
  const stamped = useStampedStations();
  const { me, error: locError, locating, locate } = useMyLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = stations.find((s) => s.id === selectedId) ?? null;
  const nearest = useMemo(() => {
    if (!me) return null;
    let best: { s: StationRecord; m: number } | null = null;
    for (const s of stations) {
      const m = distanceMeters(me, s);
      if (!best || m < best.m) best = { s, m };
    }
    return best;
  }, [me, stations]);

  const props = {
    stations,
    lines: drawn,
    stamped,
    vehicles: trains?.vehicles ?? [],
    selectedId,
    onSelect: setSelectedId,
    me,
  };

  const trainStatus =
    !showTrains ? null
    : !trains ? "Loading trains…"
    : trains.source === "unavailable" ? "Live trains unavailable"
    : `${trains.source === "stale" ? "Last seen" : "Live"} · ${trains.vehicles.length} trains`;

  return (
    <div>
      <div className="relative mt-3 h-[58dvh] min-h-[360px] overflow-hidden rounded-[12px] bg-cell ring-[0.5px] ring-separator">
        {useGoogle ? <GoogleTMap {...props} onFail={onGoogleFail} /> : <SvgTMap {...props} />}

        {/* floating controls, Apple Maps style */}
        <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-[10px] bg-bar shadow-md ring-[0.5px] ring-separator backdrop-blur-xl">
          <button
            type="button"
            aria-label="Show my location"
            onClick={locate}
            className={`flex size-10 items-center justify-center active:bg-cell-2 ${me ? "text-[#0a84ff]" : "text-label"} ${locating ? "animate-pulse" : ""}`}
          >
            <LocateIcon />
          </button>
          <div className="h-[0.5px] bg-separator" />
          <button
            type="button"
            aria-label={showTrains ? "Hide live trains" : "Show live trains"}
            aria-pressed={showTrains}
            onClick={() => setShowTrains((v) => !v)}
            className={`flex size-10 items-center justify-center active:bg-cell-2 ${showTrains ? "text-tint" : "text-label-2"}`}
          >
            <TrainToggleIcon />
          </button>
        </div>

        {trainStatus && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-bar px-3 py-1.5 text-[13px] font-medium shadow-md ring-[0.5px] ring-separator backdrop-blur-xl">
            <span className={`size-2 rounded-full ${trains?.source === "live" ? "bg-[#34c759]" : "bg-label-3"}`} />
            {trainStatus}
          </div>
        )}
        {!useGoogle && (
          <div className="absolute bottom-3 left-3 rounded-full bg-bar px-2.5 py-1 text-[11px] text-label-2 ring-[0.5px] ring-separator backdrop-blur-xl">
            Offline map
          </div>
        )}
      </div>

      {locError && <p className="mt-2 px-1 text-[13px] text-[#ff3b30]">{locError}</p>}

      {selected ? (
        <StationCard station={selected} stamped={stamped.has(selected.id)} me={me} onClose={() => setSelectedId(null)} />
      ) : nearest ? (
        <button type="button" onClick={() => setSelectedId(nearest.s.id)} className="mt-3 w-full rounded-[10px] bg-cell px-4 py-3 text-left active:bg-cell-2">
          <span className="block text-[13px] text-label-2">Nearest station</span>
          <span className="text-[17px] font-semibold">{nearest.s.name}</span>
          <span className="text-[15px] text-label-2"> · {walkMinutes(me!, nearest.s)} min walk</span>
        </button>
      ) : null}

      <section className="mt-6">
        <h2 className="px-4 pb-1.5 text-[13px] uppercase text-label-2">Your Lines</h2>
        <div className="overflow-hidden rounded-[10px] bg-cell">
          {FAMILIES.map((f) => {
            const onLine = stations.filter((s) => s.lines.some((r) => familyOf(r).id === f.id));
            const got = onLine.filter((s) => stamped.has(s.id)).length;
            return (
              <div key={f.id} className="ios-row flex items-center">
                <span className="ml-4 h-[29px] w-[29px] shrink-0 rounded-[7px]" style={{ background: f.color }} />
                <div className="ios-row-body ml-3 flex min-h-11 flex-1 items-center gap-3 py-2 pr-4">
                  <span className="flex-1 text-[17px]">{f.name}</span>
                  <span className="text-[15px] text-label-2 tabular-nums">
                    {got}/{onLine.length}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="px-4 pt-1.5 text-[13px] text-label-2">Check in at a station to stamp it. Stamped stations light up on the map.</p>
      </section>
    </div>
  );
}
