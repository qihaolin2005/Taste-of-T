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
  /** Your group's adventure: everyone's path so far and where they are now, drawn live. */
  crew?: readonly CrewTrail[];
};

/** One person's trip on the adventure map (see adventure.ts). */
export type CrewTrail = {
  id: string;
  /** "You", or their name in the group. */
  label: string;
  you: boolean;
  color: string;
  /** Still on the way (recording): their dot pulses. */
  live: boolean;
  arrived: boolean;
  /** The path so far: bus/T legs drawn thick, walking thin. */
  legs: { transit: boolean; path: LatLng[] }[];
  /** Where they are now (the end of the path), null before the first GPS fix. */
  at: LatLng | null;
};

/**
 * When set, only these MBTA route ids ("Red", "Green-B", ...) are drawn, with their stations and
 * trains: the lines the trip rides. null = show everything.
 */
export type VisibleRoutes = ReadonlySet<string> | null;
