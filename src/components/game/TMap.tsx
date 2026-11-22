// Owner: P4 - Game Layer & Map (see TEAM.md)
// Interactive T map: real MBTA lines + stations, live trains, your stamps.
// Uses Google Maps when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set and loads; otherwise (no key,
// bad key, offline) the SVG map drawn from the same MBTA snapshot. The demo never breaks.
// With a `destination` (/map?to=lat,lng&name=..., from Spin or a group pick) it also shows the
// route there by T and bus from where you are (GET /api/directions).
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { distanceMeters, walkMinutes, type LatLng } from "@/lib/geo";
import type { LineRecord, StationRecord } from "@/lib/mbta/stations";
import { tRoutesInTrip, type TripPlan } from "@/features/directions/types";
import GoogleTMap, { hasGoogleMapsKey, isDemoMode } from "./map/GoogleTMap";
import SvgTMap from "./map/SvgTMap";
import StationCard from "./map/StationCard";
import RouteCard, { type RouteState } from "./map/RouteCard";
import { useLiveTrains, useMyLocation, useStampedStations } from "./map/hooks";
import { decodeLines, onVisibleRoute } from "./map/model";

type Props = { stations: readonly StationRecord[]; lines: readonly LineRecord[]; destination?: (LatLng & { name?: string; placeId?: string }) | null };

/** Plans the trip once we know where you are. Re-plans only if you move ~100 m+. */
function useRoute(destination: Props["destination"], me: LatLng | null, locError: string | null) {
  const [result, setResult] = useState<{ key: string; state: RouteState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Round to ~100 m so small GPS jitter doesn't re-plan.
  const from = me ? `${me.lat.toFixed(3)},${me.lng.toFixed(3)}` : null;
  const to = destination ? `${destination.lat},${destination.lng}` : null;
  const key = `${from}|${to}|${attempt}`;

  useEffect(() => {
    if (!from || !to || !destination) return;
    const ctrl = new AbortController();
    const q = new URLSearchParams({ from, to, ...(destination.name ? { name: destination.name } : {}) });
    fetch(`/api/directions?${q}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error?.message ?? "Couldn't plan a route right now.");
        setResult({ key, state: { status: "ready", plan: (body?.plan ?? null) as TripPlan | null } });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setResult({ key, state: { status: "error", message: err.message } });
      });
    return () => ctrl.abort();
  }, [from, to, destination, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (!destination) return { state: null, retry };
  const state: RouteState =
    result?.key === key ? result.state
    : from ? { status: "loading" }
    : locError ? { status: "error", message: `${locError}. Turn on location to see the route from where you are, or open Google Maps.` }
    : { status: "locating" };
  return { state, retry };
}

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

export default function TMap({ stations, lines, destination = null }: Props) {
  const drawn = useMemo(() => decodeLines(lines), [lines]);
  const [googleFailed, setGoogleFailed] = useState(false);
  const onGoogleFail = useCallback(() => setGoogleFailed(true), []);
  const useGoogle = hasGoogleMapsKey && !googleFailed;

  const [showTrains, setShowTrains] = useState(true);
  const trains = useLiveTrains(showTrains);
  const stamped = useStampedStations();
  const { me, error: locError, locating, locate } = useMyLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Routing to a place: find where you are right away, then plan the trip.
  useEffect(() => {
    if (destination) locate();
  }, [destination, locate]);
  const { state: routeState, retry } = useRoute(destination, me, locError);
  const retryRoute = useCallback(() => {
    if (!me) locate();
    retry();
  }, [me, locate, retry]);
  const plan = routeState?.status === "ready" ? routeState.plan : null;
  const route = plan?.path ?? null;

  // With a route showing, hide the T lines it doesn't ride so the trip is easy to see.
  // "Show all lines" is remembered per destination, so a new route starts focused again.
  const destKey = destination ? `${destination.lat},${destination.lng}` : null;
  const [showAllFor, setShowAllFor] = useState<string | null>(null);
  const focused = !!plan && showAllFor !== destKey;
  const ridden = useMemo(() => (plan ? tRoutesInTrip(plan, lines.map((l) => l.id)) : null), [plan, lines]);
  const visibleRoutes = focused ? ridden : null;
  const shownTrains = (trains?.vehicles ?? []).filter((v) => onVisibleRoute(visibleRoutes, [v.routeId]));

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
    destination,
    route,
    visibleRoutes,
  };

  const trainStatus =
    !showTrains ? null
    : !trains ? "Loading trains…"
    : trains.source === "unavailable" ? "Live trains unavailable"
    : `${trains.source === "stale" ? "Last seen" : "Live"} · ${shownTrains.length} train${shownTrains.length === 1 ? "" : "s"}${visibleRoutes ? " on your route" : ""}`;

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
          <div className={`absolute left-3 ${plan ? "top-[52px]" : "bottom-3"} rounded-full bg-bar px-2.5 py-1 text-[11px] text-label-2 ring-[0.5px] ring-separator backdrop-blur-xl`}>
            {isDemoMode ? "Demo mode · offline map" : "Offline map"}
          </div>
        )}

        {plan && (
          <button
            type="button"
            aria-pressed={!focused}
            onClick={() => setShowAllFor(focused ? destKey : null)}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-bar px-3.5 py-1.5 text-[13px] font-semibold text-tint shadow-md ring-[0.5px] ring-separator backdrop-blur-xl active:bg-cell-2"
          >
            {focused ? "Show all lines" : "Show just my route"}
          </button>
        )}
      </div>

      {locError && <p className="mt-2 px-1 text-[13px] text-[#ff3b30]">{locError}</p>}

      {selected ? (
        <StationCard station={selected} stamped={stamped.has(selected.id)} me={me} onClose={() => setSelectedId(null)} />
      ) : destination && routeState ? (
        <RouteCard to={destination} me={me} state={routeState} onRetry={retryRoute} />
      ) : nearest ? (
        <button type="button" onClick={() => setSelectedId(nearest.s.id)} className="mt-3 w-full rounded-[10px] bg-cell px-4 py-3 text-left active:bg-cell-2">
          <span className="block text-[13px] text-label-2">Nearest station</span>
          <span className="text-[17px] font-semibold">{nearest.s.name}</span>
          <span className="text-[15px] text-label-2"> · {walkMinutes(me!, nearest.s)} min walk</span>
        </button>
      ) : null}
    </div>
  );
}
