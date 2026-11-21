// Owner: P4 - Game Layer & Map (see TEAM.md)
import type { LatLng } from "@/lib/geo";
import type { Vehicle } from "@/lib/mbta/vehicles";
import type { DrawnLine, StationRecord } from "./model";

/** Props every map renderer (Google, SVG) accepts. */
export type RendererProps = {
  stations: readonly StationRecord[];
  lines: readonly DrawnLine[];
  stamped: ReadonlySet<string>;
  vehicles: readonly Vehicle[];
  selectedId: string | null;
  onSelect: (stationId: string | null) => void;
  me: LatLng | null;
};
