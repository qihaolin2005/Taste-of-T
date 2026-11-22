// Owner: P4 - Game Layer & Map (see TEAM.md)
import type { LatLng } from "@/lib/geo";
import type { Vehicle } from "@/lib/mbta/vehicles";
import type { TripPath } from "@/features/directions/types";
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
  /** A place being routed to (from Spin or a group pick), and the route there once planned. */
  destination?: (LatLng & { name?: string }) | null;
  route?: readonly TripPath[] | null;
  visibleRoutes?: VisibleRoutes;
};

/**
 * When set, only these MBTA route ids ("Red", "Green-B", ...) are drawn, with their stations and
 * trains: the lines the trip rides. null = show everything.
 */
export type VisibleRoutes = ReadonlySet<string> | null;
