// Owner: P4 - Game Layer & Map (see TEAM.md)
// Big Strava-style numbers for one trip.
import type { TripView } from "@/features/trips/service";
import { duration, miles } from "./format";

export default function TripStats({ trip }: { trip: TripView }) {
  const items = [
    { label: "Distance", value: miles(trip.distanceM) },
    { label: "Time", value: duration(trip.durationSec) },
    { label: "Walked", value: miles(trip.walkM) },
    { label: "Bus/T", value: miles(trip.transitM) },
  ];
  return (
    <div className="mt-3 grid grid-cols-4 gap-px overflow-hidden rounded-[10px] bg-separator">
      {items.map((i) => (
        <div key={i.label} className="bg-cell px-2 py-3 text-center">
          <p className="text-[12px] uppercase text-label-2">{i.label}</p>
          <p className="mt-0.5 text-[17px] font-semibold tabular-nums">{i.value}</p>
        </div>
      ))}
    </div>
  );
}
