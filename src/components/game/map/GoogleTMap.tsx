// Owner: P4 - Game Layer & Map (see TEAM.md)
// Google Maps renderer. Needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; calls onFail() if the
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
import { useEffect } from "react";
import type { RendererProps } from "./types";
import { DOWNTOWN, familyOf, isInterchange, stationFamilies } from "./model";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
// Advanced markers + dark mode need a Map ID; Google's DEMO_MAP_ID works for development.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

export const hasGoogleMapsKey = API_KEY.length > 0;

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

export default function GoogleTMap({ stations, lines, stamped, vehicles, selectedId, onSelect, me, onFail }: RendererProps & { onFail: () => void }) {
  const selected = stations.find((s) => s.id === selectedId) ?? null;

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

        {me && (
          <AdvancedMarker position={me} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} zIndex={1100} title="You">
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#0a84ff", border: "3px solid #fff", boxShadow: "0 0 0 6px rgba(10,132,255,.25)" }} />
          </AdvancedMarker>
        )}

        <CameraFollow target={me} zoom={15} />
        <CameraFollow target={selected} />
      </Map>
    </APIProvider>
  );
}
