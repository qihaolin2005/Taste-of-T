// Owner: P4 - Game Layer & Map (see TEAM.md)
// Strava-style map of one or more recorded trips. Transit legs are thick and solid, walking
// legs thin. Google Maps when available, otherwise an offline SVG drawing of the paths.
"use client";

import { AdvancedMarker, AdvancedMarkerAnchorPoint, APIProvider, ColorScheme, Map, Polyline, useMap } from "@vis.gl/react-google-maps";
import { Fragment, useEffect, useMemo, useState } from "react";
import { hasGoogleMapsKey } from "@/components/game/map/GoogleTMap";
import type { TripView } from "@/features/trips/service";

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/** One color per person, distinct on light and dark maps. */
export const TRIP_COLORS = ["#0a84ff", "#ff375f", "#30d158", "#ff9f0a", "#bf5af2", "#64d2ff", "#ffd60a", "#ac8e68", "#5e5ce6", "#ff6961", "#66d4cf", "#e5e5ea"];

export type MapTrip = Pick<TripView, "id" | "legs" | "status"> & { color: string; label: string };
type Props = { trips: MapTrip[]; destination?: { lat: number; lng: number; name: string | null } | null; className?: string };

type P = { lat: number; lng: number };
const toP = ([lat, lng]: [number, number]): P => ({ lat, lng });

function endpoints(t: MapTrip): { start: P; end: P } | null {
  const pts = t.legs.flatMap((l) => l.path);
  return pts.length ? { start: toP(pts[0]), end: toP(pts.at(-1)!) } : null;
}

function allPoints(trips: MapTrip[], destination: Props["destination"]): P[] {
  const pts = trips.flatMap((t) => t.legs.flatMap((l) => l.path.map(toP)));
  if (destination) pts.push(destination);
  return pts;
}

function FitBounds({ points }: { points: P[] }) {
  const map = useMap();
  const key = points.length ? `${points.length}:${points[0].lat}:${points.at(-1)!.lat}` : "";
  useEffect(() => {
    if (!map || !points.length) return;
    const b = new google.maps.LatLngBounds();
    points.forEach((p) => b.extend(p));
    map.fitBounds(b, 48);
    if ((map.getZoom() ?? 0) > 17) map.setZoom(17);
    // refit only when the set of points meaningfully changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

function Dot({ color, hollow, pulse }: { color: string; hollow?: boolean; pulse?: boolean }) {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: hollow ? "#fff" : color,
        border: `3px solid ${hollow ? color : "#fff"}`,
        boxShadow: pulse ? `0 0 0 6px ${color}40` : "0 1px 3px rgba(0,0,0,.45)",
      }}
    />
  );
}

function Pin() {
  return (
    <div style={{ fontSize: 26, lineHeight: 1, filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }} aria-label="Restaurant">
      🍜
    </div>
  );
}

function GoogleTripMap({ trips, destination, onFail }: Props & { onFail: () => void }) {
  const points = useMemo(() => allPoints(trips, destination), [trips, destination]);
  return (
    <APIProvider apiKey={API_KEY} onError={onFail}>
      <Map
        className="h-full w-full"
        mapId={MAP_ID}
        colorScheme={ColorScheme.FOLLOW_SYSTEM}
        defaultCenter={points[0] ?? { lat: 42.3555, lng: -71.0605 }}
        defaultZoom={14}
        gestureHandling="greedy"
        disableDefaultUI
        clickableIcons={false}
      >
        {trips.flatMap((t) =>
          t.legs.map((leg, i) => (
            <Polyline
              key={`${t.id}-${i}`}
              path={leg.path.map(toP)}
              strokeColor={t.color}
              strokeWeight={leg.mode === "transit" ? 7 : 4}
              strokeOpacity={leg.mode === "transit" ? 0.95 : 0.75}
              clickable={false}
            />
          )),
        )}
        {trips.map((t) => {
          const e = endpoints(t);
          if (!e) return null;
          return (
            <Fragment key={t.id}>
              <AdvancedMarker position={e.start} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} title={`${t.label}: start`} zIndex={500}>
                <Dot color={t.color} hollow />
              </AdvancedMarker>
              <AdvancedMarker position={e.end} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} title={t.label} zIndex={600}>
                <Dot color={t.color} pulse={t.status === "recording"} />
              </AdvancedMarker>
            </Fragment>
          );
        })}
        {destination && (
          <AdvancedMarker position={destination} anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER} title={destination.name ?? "Restaurant"} zIndex={1000}>
            <Pin />
          </AdvancedMarker>
        )}
        <FitBounds points={points} />
      </Map>
    </APIProvider>
  );
}

/** Offline fallback: the paths on a plain grid, projected to fit. */
function SvgTripMap({ trips, destination }: Props) {
  const W = 360;
  const H = 300;
  const pad = 24;
  const points = allPoints(trips, destination);
  if (!points.length) return <div className="flex h-full items-center justify-center text-[15px] text-label-2">No path yet</div>;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180); // shrink longitude so the map isn't stretched
  const minX = Math.min(...lngs) * kx;
  const maxX = Math.max(...lngs) * kx;
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const scale = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1e-6), (H - 2 * pad) / Math.max(maxY - minY, 1e-6));
  const ox = (W - (maxX - minX) * scale) / 2;
  const oy = (H - (maxY - minY) * scale) / 2;
  const xy = (p: P) => [ox + (p.lng * kx - minX) * scale, H - (oy + (p.lat - minY) * scale)] as const;
  const d = (path: [number, number][]) => path.map((pt, i) => `${i ? "L" : "M"}${xy(toP(pt)).map((n) => n.toFixed(1)).join(" ")}`).join("");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full bg-cell-2" role="img" aria-label="Trip paths">
      <defs>
        <pattern id="trip-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="currentColor" strokeOpacity=".08" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#trip-grid)" className="text-label" />
      {trips.flatMap((t) =>
        t.legs.map((leg, i) => (
          <path
            key={`${t.id}-${i}`}
            d={d(leg.path)}
            fill="none"
            stroke={t.color}
            strokeWidth={leg.mode === "transit" ? 5 : 3}
            strokeOpacity={leg.mode === "transit" ? 0.95 : 0.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )),
      )}
      {trips.map((t) => {
        const e = endpoints(t);
        if (!e) return null;
        const [sx, sy] = xy(e.start);
        const [ex, ey] = xy(e.end);
        return (
          <g key={t.id}>
            <circle cx={sx} cy={sy} r={5} fill="#fff" stroke={t.color} strokeWidth={3} />
            <circle cx={ex} cy={ey} r={6} fill={t.color} stroke="#fff" strokeWidth={2.5} />
          </g>
        );
      })}
      {destination && (
        <text x={xy(destination)[0]} y={xy(destination)[1]} textAnchor="middle" fontSize="22">
          🍜
        </text>
      )}
    </svg>
  );
}

export default function TripMap({ trips, destination, className = "h-[320px]" }: Props) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`overflow-hidden rounded-[10px] bg-cell ${className}`}>
      {hasGoogleMapsKey && !failed ? <GoogleTripMap trips={trips} destination={destination} onFail={() => setFailed(true)} /> : <SvgTripMap trips={trips} destination={destination} />}
    </div>
  );
}
