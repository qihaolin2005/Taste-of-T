// Owner: P4 - Game Layer & Map (see TEAM.md)
// Where the restaurant is: a purple map pin with the app's fork-and-knife glyph (ForkKnifeIcon in
// src/components/shared/ios/icons.tsx). FoodPin is for Google markers (HTML); SvgFoodPin draws the
// same pin inside the offline SVG maps.
import { ForkKnifeIcon } from "@/components/shared/ios";

const PURPLE = "#7954ac";
/** ForkKnifeIcon's path (24x24 box), for drawing inside an <svg>. */
const FORK_KNIFE_D = "M7 3v7M5 3v5a2 2 0 0 0 4 0V3M7 10v11M17 21V3c-2 1.5-3 4-3 7v3h3";

/** Google marker: anchor it at BOTTOM_CENTER so the tip sits on the restaurant. */
export function FoodPin({ name }: { name?: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }} aria-label={name ?? "Restaurant"}>
      {name && (
        <div style={{ marginBottom: 4, padding: "2px 8px", borderRadius: 8, background: PURPLE, color: "#fff", font: "600 12px system-ui", whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,.35)" }}>{name}</div>
      )}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50% 50% 50% 0",
          transform: "rotate(-45deg)",
          background: PURPLE,
          border: "3px solid #fff",
          boxShadow: "0 2px 6px rgba(0,0,0,.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6, // the rotated tip pokes below the box
        }}
      >
        <div style={{ transform: "rotate(45deg)", color: "#fff", display: "flex" }}>
          <ForkKnifeIcon size={17} />
        </div>
      </div>
    </div>
  );
}

/**
 * The same pin inside an SVG map, its tip at (x, y). `u` is SVG units per screen pixel, so the
 * pin stays the same size on screen at any zoom (1 for a fixed-size SVG).
 */
export function SvgFoodPin({ x, y, u = 1, name, labelBg = "var(--cell)" }: { x: number; y: number; u?: number; name?: string | null; labelBg?: string }) {
  const r = 15 * u; // head radius
  const cy = y - 24 * u; // head center
  const k = (18 * u) / 24; // glyph scale (24-unit icon drawn at 18 px)
  return (
    <g pointerEvents="none">
      <title>{name ?? "Restaurant"}</title>
      {/* teardrop: a circle with a point at the bottom */}
      <path
        d={`M${x} ${y} L${x - r * 0.62} ${cy + r * 0.78} A${r} ${r} 0 1 1 ${x + r * 0.62} ${cy + r * 0.78} Z`}
        fill={PURPLE}
        stroke="#fff"
        strokeWidth={2.5 * u}
        strokeLinejoin="round"
      />
      <g transform={`translate(${x - 12 * k} ${cy - 12 * k}) scale(${k})`}>
        <path d={FORK_KNIFE_D} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {name && (
        <text x={x} y={cy - r - 6 * u} textAnchor="middle" fontSize={13 * u} fontWeight={700} fill={PURPLE} stroke={labelBg} strokeWidth={3 * u} paintOrder="stroke">
          {name}
        </text>
      )}
    </g>
  );
}
