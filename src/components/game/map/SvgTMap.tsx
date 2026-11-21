// Owner: P4 - Game Layer & Map (see TEAM.md)
// Offline map: the real MBTA geometry projected into an SVG. Used when there's no Google
// Maps key, the Google API fails, or the phone is offline. Drag to pan, pinch/wheel to zoom.
"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { LatLng } from "@/lib/geo";
import type { RendererProps } from "./types";
import { DOWNTOWN, familyOf, isInterchange, stationFamilies } from "./model";

const W = 1000; // projected width in SVG units
const MIN_W = 40; // most zoomed in (viewBox width)
type Box = { x: number; y: number; w: number; h: number };

/** Equirectangular projection, x scaled by cos(latitude) so Boston isn't stretched. */
function useProjection(stations: RendererProps["stations"]) {
  return useMemo(() => {
    const lats = stations.map((s) => s.lat);
    const lngs = stations.map((s) => s.lng);
    const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
    const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
    const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const pad = 0.04;
    const spanX = (maxLng - minLng) * kx * (1 + 2 * pad);
    const spanY = (maxLat - minLat) * (1 + 2 * pad);
    const scale = W / spanX;
    const H = spanY * scale;
    const project = (p: LatLng) => ({
      x: ((p.lng - minLng) * kx + spanX * (pad / (1 + 2 * pad))) * scale,
      y: ((maxLat - p.lat) + spanY * (pad / (1 + 2 * pad))) * scale,
    });
    return { project, H };
  }, [stations]);
}

export default function SvgTMap({ stations, lines, stamped, vehicles, selectedId, onSelect, me }: RendererProps) {
  const { project, H } = useProjection(stations);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState({ w: 360, h: 480 }); // rendered size in CSS px

  // Start zoomed on downtown, where the food is.
  const [box, setBox] = useState<Box>(() => ({ x: 0, y: 0, w: W, h: H }));
  const initialized = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPx({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the viewBox aspect equal to the element's, centered on downtown at first.
  useEffect(() => {
    const aspect = px.h / px.w;
    setBox((b) => {
      if (!initialized.current) {
        initialized.current = true;
        const c = project(DOWNTOWN);
        const w = W * 0.32;
        return { x: c.x - w / 2, y: c.y - (w * aspect) / 2, w, h: w * aspect };
      }
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      return { x: cx - b.w / 2, y: cy - (b.w * aspect) / 2, w: b.w, h: b.w * aspect };
    });
  }, [px, project]);

  // Pan to "me" when it's (re)located. Adjusting state during render on a prop change is
  // React's recommended alternative to an effect here.
  const [lastMe, setLastMe] = useState(me);
  if (me !== lastMe) {
    setLastMe(me);
    if (me) {
      const f = project(me);
      setBox((b) => ({ ...b, x: f.x - b.w / 2, y: f.y - b.h / 2 }));
    }
  }

  const unitsPerPx = box.w / px.w; // SVG units per screen pixel: keeps dots/text a constant size
  const zoomBy = (factor: number, cx = box.x + box.w / 2, cy = box.y + box.h / 2) =>
    setBox((b) => {
      const w = Math.min(W * 1.2, Math.max(MIN_W, b.w * factor));
      const k = w / b.w;
      return { x: cx - (cx - b.x) * k, y: cy - (cy - b.y) * k, w, h: b.h * k };
    });

  // --- gestures: one pointer pans, two pointers pinch-zoom ---
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinch = useRef<number | null>(null);
  const moved = useRef(0);

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      moved.current += Math.abs(dx) + Math.abs(dy);
      setBox((b) => ({ ...b, x: b.x - dx * (b.w / px.w), y: b.y - dy * (b.w / px.w) }));
    } else if (pts.length === 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinch.current) zoomBy(lastPinch.current / d);
      lastPinch.current = d;
      moved.current += 10;
    }
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) lastPinch.current = null;
  };
  const tapped = () => moved.current < 6; // ignore taps that were really drags

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setBox((b) => {
        const cx = b.x + ((e.clientX - r.left) / r.width) * b.w;
        const cy = b.y + ((e.clientY - r.top) / r.height) * b.h;
        const w = Math.min(W * 1.2, Math.max(MIN_W, b.w * Math.exp(e.deltaY * 0.0015)));
        const k = w / b.w;
        return { x: cx - (cx - b.x) * k, y: cy - (cy - b.y) * k, w, h: b.h * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const showAllLabels = unitsPerPx < 0.35;
  const u = unitsPerPx;

  return (
    <div ref={wrapRef} className="relative h-full w-full touch-none select-none bg-[color-mix(in_srgb,var(--cell)_85%,#7fa7c9)]">
      <svg
        className="h-full w-full"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => tapped() && onSelect(null)}
        role="img"
        aria-label="Map of the T"
      >
        {lines.map((l) =>
          l.paths.map((path, i) => (
            <polyline
              key={`${l.id}-${i}`}
              points={path.map((p) => { const q = project(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(" ")}
              fill="none"
              stroke={l.color}
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )),
        )}

        {stations.map((s) => {
          const p = project(s);
          const color = stationFamilies(s)[0]?.color ?? "#8e8e93";
          const isStamped = stamped.has(s.id);
          const isSel = s.id === selectedId;
          const inter = isInterchange(s);
          const r = (isSel ? 9 : isStamped ? 7 : inter ? 6 : 4.5) * u;
          return (
            <g
              key={s.id}
              onClick={(e) => {
                e.stopPropagation();
                if (tapped()) onSelect(s.id);
              }}
              className="cursor-pointer"
            >
              {/* larger invisible hit area for fingers */}
              <circle cx={p.x} cy={p.y} r={14 * u} fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={isStamped ? color : "#fff"}
                stroke={isStamped ? "#fff" : inter ? "#1c1c1e" : color}
                strokeWidth={(inter || isSel ? 2.5 : 2) * u}
              />
              {(showAllLabels || isSel || isStamped) && (
                <text
                  x={p.x + r + 3 * u}
                  y={p.y + 4 * u}
                  fontSize={12 * u}
                  fontWeight={isSel ? 700 : 500}
                  fill="var(--label)"
                  stroke="var(--cell)"
                  strokeWidth={3 * u}
                  paintOrder="stroke"
                >
                  {s.name}
                </text>
              )}
            </g>
          );
        })}

        {vehicles.map((v) => {
          const p = project(v);
          const fam = familyOf(v.routeId);
          return (
            <g key={v.id} transform={`translate(${p.x} ${p.y}) rotate(${v.bearing ?? 0})`} pointerEvents="none">
              <circle r={7 * u} fill={fam.color} stroke="#fff" strokeWidth={2 * u} />
              <path d={`M0 ${-4 * u} L${3 * u} ${2.5 * u} L${-3 * u} ${2.5 * u} Z`} fill="#fff" />
            </g>
          );
        })}

        {me && (() => {
          const p = project(me);
          return (
            <g pointerEvents="none">
              <circle cx={p.x} cy={p.y} r={14 * u} fill="#0a84ff" opacity={0.2} />
              <circle cx={p.x} cy={p.y} r={7 * u} fill="#0a84ff" stroke="#fff" strokeWidth={3 * u} />
            </g>
          );
        })()}
      </svg>

      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-[10px] bg-bar shadow-md ring-[0.5px] ring-separator backdrop-blur-xl">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(0.6)} className="flex size-10 items-center justify-center text-[22px] text-label active:bg-cell-2">+</button>
        <div className="h-[0.5px] bg-separator" />
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 0.6)} className="flex size-10 items-center justify-center text-[22px] text-label active:bg-cell-2">−</button>
      </div>
    </div>
  );
}
