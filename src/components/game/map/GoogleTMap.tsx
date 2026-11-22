// Owner: P4 - Game Layer & Map (see TEAM.md)
// Google Maps renderer. Needs NEXT_PUBLIC_MAP=google and NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; calls onFail() if the
// API can't load or the key is rejected, so TMap can fall back to the offline SVG map.
"use client";

import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  APILoadingStatus,
  APIProvider,
  ColorScheme,
  Map,
  Polyline,
  useApiLoadingStatus,
  useMap,
} from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef } from "react";
import type { RendererProps } from "./types";
import { DOWNTOWN, familyOf, isInterchange, onVisibleRoute, stationFamilies } from "./model";
import { crewKey } from "./adventure";
import { FoodPin } from "./FoodPin";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
// Advanced markers + dark mode need a Map ID; Google's DEMO_MAP_ID works for development.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

/**
 * Google Maps is OFF unless NEXT_PUBLIC_MAP=google, so the demo doesn't spend the browser
 * key's quota; the offline SVG maps are used instead. Turning it on also needs the key.
 * (Restart `next dev` / rebuild after changing it: NEXT_PUBLIC_ values are baked in.)
 */
export const googleMapsEnabled = process.env.NEXT_PUBLIC_MAP === "google" && API_KEY.length > 0;

/**
 * The group Trip Map (everyone's live paths) uses Google Maps whenever there's a key, even with
 * the T map offline: it's the map people watch during an adventure. NEXT_PUBLIC_TRIP_MAP=offline
 * turns it off too. Without a key, or if Google fails, it draws the offline SVG.
 */
export const googleTripMapEnabled = process.env.NEXT_PUBLIC_TRIP_MAP !== "offline" && API_KEY.length > 0;

function FailureWatcher({ onFail }: { onFail: () => void }) {
  const status = useApiLoadingStatus();
  useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) onFail();
  }, [status, onFail]);
  return null;
}

/** Pan to the user / selected station when they change. */
function CameraFollow({ target, zoom }: { target: google.maps.LatLngLiteral | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
    if (zoom && (map.getZoom() ?? 0) < zoom) map.setZoom(zoom);
  }, [map, target, zoom]);
  return null;
}

/** Frame the whole trip (you, the route, the place) once it's planned. */
function FitRoute({ points }: { points: google.maps.LatLngLiteral[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length < 2) return;
    const bounds = new google.maps.LatLngBounds();
    for (const p of points) bounds.extend(p);
    map.fitBounds(bounds, 48);
  }, [map, points]);
  return null;
}

/** Walking legs: a dotted gray line (Google draws dots via a repeated symbol). */
const WALK_DOTS = [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#636366", scale: 3 }, offset: "0", repeat: "10px" }];

/**
 * Frame the adventure (the place and everyone's position) when someone joins the map or the
 * place changes. Not on every live update, so you can pan around while paths grow.
 */
function FitCrew({ fitKey, points }: { fitKey: string; points: google.maps.LatLngLiteral[] }) {
  const map = useMap();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !points.length || done.current === fitKey) return;
    done.current = fitKey;
    if (points.length === 1) {
      map.panTo(points[0]);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of points) bounds.extend(p);
    map.fitBounds(bounds, 56);
    if ((map.getZoom() ?? 0) > 16) map.setZoom(16);
  }, [map, fitKey, points]);
  return null;
}

/** Someone in your group: their color, their name, pulsing while they're on the way. */
function CrewDot({ color, label, live }: { color: string; label: string; live: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ marginBottom: 3, padding: "1px 6px", borderRadius: 7, background: color, color: "#fff", font: "700 11px system-ui", whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }}>{label}</div>
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: color, border: "3px solid #fff", boxShadow: live ? `0 0 0 6px ${color}55` : "0 1px 3px rgba(0,0,0,.45)" }} />
    </div>
  );
}

function StationDot({ color, interchange, stamped, selected }: { color: string; interchange: boolean; stamped: boolean; selected: boolean }) {
  const size = selected ? 20 : stamped ? 16 : interchange ? 13 : 10;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: stamped ? color : "#fff",
        border: `${interchange || selected ? 3 : 2.5}px solid ${interchange && !stamped ? "#1c1c1e" : stamped ? "#fff" : color}`,
        boxShadow: selected || stamped ? "0 1px 4px rgba(0,0,0,.45)" : "0 0 0 1px rgba(255,255,255,.6)",
        cursor: "pointer",
      }}
    />
  );
}

function TrainMarker({ color, bearing }: { color: string; bearing: number | null }) {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: color,
        border: "2px solid #fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: bearing == null ? undefined : `rotate(${bearing}deg)`,
      }}
    >
      {/* arrow points in the direction of travel */}
      <div style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "7px solid #fff", marginTop: -2 }} />
    </div>
  );
}

export default function GoogleTMap({ stations: allStations, lines: allLines, stamped, vehicles: allVehicles, selectedId, onSelect, me, destination, route, visibleRoutes, crew, onFail }: RendererProps & { onFail: () => void }) {
  const crewPoints = useMemo(() => [...(crew ?? []).flatMap((c) => (c.at ? [c.at] : [])), ...(destination ? [destination] : [])], [crew, destination]);
  // With a route showing, draw only the T lines it rides (plus their stations and trains).
  const lines = useMemo(() => allLines.filter((l) => onVisibleRoute(visibleRoutes, [l.id])), [allLines, visibleRoutes]);
  const stations = useMemo(() => allStations.filter((s) => onVisibleRoute(visibleRoutes, s.lines) || s.id === selectedId), [allStations, visibleRoutes, selectedId]);
  const vehicles = useMemo(() => allVehicles.filter((v) => onVisibleRoute(visibleRoutes, [v.routeId])), [allVehicles, visibleRoutes]);
  const selected = stations.find((s) => s.id === selectedId) ?? null;
  const tripPoints = useMemo(() => {
    const pts = (route ?? []).flatMap((p) => p.points);
    if (destination) pts.push(destination);
    if (me && destination) pts.push(me);
    return pts;
  }, [route, destination, me]);

  return (
    <APIProvider apiKey={API_KEY} onError={onFail}>
      <FailureWatcher onFail={onFail} />
      <Map
        className="h-full w-full"
        mapId={MAP_ID}
        colorScheme={ColorScheme.FOLLOW_SYSTEM}
        defaultCenter={DOWNTOWN}
        defaultZoom={13}
        gestureHandling="greedy"
        disableDefaultUI
        clickableIcons={false}
        onClick={() => onSelect(null)}
      >
        {lines.flatMap((l) =>
          l.paths.map((path, i) => <Polyline key={`${l.id}-${i}`} path={path} strokeColor={l.color} strokeWeight={5} strokeOpacity={0.9} clickable={false} />),
        )}

        {stations.map((s) => {
          const fam = stationFamilies(s)[0];
          return (
            <AdvancedMarker
              key={s.id}
              position={s}
              title={s.name}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              zIndex={s.id === selectedId ? 1000 : stamped.has(s.id) ? 500 : 100}
              onClick={() => onSelect(s.id)}
            >
              <StationDot color={fam?.color ?? "#8e8e93"} interchange={isInterchange(s)} stamped={stamped.has(s.id)} selected={s.id === selectedId} />
            </AdvancedMarker>
          );
        })}

        {vehicles.map((v) => (
          <AdvancedMarker key={v.id} position={v} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} zIndex={800} title={`${familyOf(v.routeId).name} train`}>
            <TrainMarker color={familyOf(v.routeId).color} bearing={v.bearing} />
          </AdvancedMarker>
        ))}

        {/* The trip: rides in their line color over a white casing, walks dotted. */}
        {(route ?? []).map((p, i) =>
          p.walk ? (
            <Polyline key={`trip-${i}`} path={p.points} strokeOpacity={0} icons={WALK_DOTS} zIndex={20} clickable={false} />
          ) : (
            [
              <Polyline key={`trip-${i}-casing`} path={p.points} strokeColor="#ffffff" strokeWeight={11} strokeOpacity={1} zIndex={20} clickable={false} />,
              <Polyline key={`trip-${i}`} path={p.points} strokeColor={p.color} strokeWeight={7} strokeOpacity={1} zIndex={21} clickable={false} />,
            ]
          ),
        )}

        {/* The group adventure: each person's path so far in their color (bus/T thick, walks thin). */}
        {(crew ?? []).flatMap((c) =>
          c.legs.map((leg, i) => (
            <Polyline
              key={`crew-${c.id}-${i}`}
              path={leg.path}
              strokeColor={c.color}
              strokeWeight={leg.transit ? 7 : 4}
              strokeOpacity={leg.transit ? 0.95 : 0.8}
              zIndex={30}
              clickable={false}
            />
          )),
        )}
        {(crew ?? []).map((c) =>
          c.at ? (
            <AdvancedMarker key={`crew-at-${c.id}`} position={c.at} anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER} zIndex={1050} title={c.label}>
              <CrewDot color={c.color} label={c.label} live={c.live} />
            </AdvancedMarker>
          ) : null,
        )}
        {crew && crew.length > 0 && <FitCrew fitKey={crewKey(crew, destination)} points={crewPoints} />}

        {destination && (
          <AdvancedMarker position={destination} anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER} zIndex={1200} title={destination.name ?? "Destination"}>
            <FoodPin name={destination.name} />
          </AdvancedMarker>
        )}

        {me && (
          <AdvancedMarker position={me} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} zIndex={1100} title="You">
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#0a84ff", border: "3px solid #fff", boxShadow: "0 0 0 6px rgba(10,132,255,.25)" }} />
          </AdvancedMarker>
        )}

        {/* With a destination, frame the trip; otherwise follow you as before. */}
        {destination ? <FitRoute points={tripPoints} /> : <CameraFollow target={me} zoom={15} />}
        {destination && !route && <CameraFollow target={destination} zoom={15} />}
        <CameraFollow target={selected} />
      </Map>
    </APIProvider>
  );
}
