// Owner: P4 - Game Layer & Map (see TEAM.md)
// Details for the tapped station, shown under the map like an Apple Maps place card.
"use client";

import { distanceMeters, walkMinutes, type LatLng } from "@/lib/geo";
import type { StationRecord } from "./model";
import { familyOf } from "./model";

type Props = { station: StationRecord; stamped: boolean; me: LatLng | null; onClose: () => void };

export default function StationCard({ station, stamped, me, onClose }: Props) {
  // Show branch letters for the Green Line ("B C D E"), plain names otherwise.
  const routes = [...new Set(station.lines)];
  const km = me ? distanceMeters(me, station) / 1000 : null;

  return (
    <div className="mt-3 rounded-[10px] bg-cell p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[22px] font-bold leading-7">{station.name}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {routes.map((r) => {
              const fam = familyOf(r);
              const label = r.startsWith("Green-") ? `Green ${r.slice(-1)}` : fam.name;
              return (
                <span key={r} className="rounded-full px-2.5 py-0.5 text-[13px] font-semibold text-white" style={{ background: fam.color }}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-cell-2 text-[15px] text-label-2">
          ✕
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-[10px] bg-grouped px-3 py-2">
          <p className="text-[12px] uppercase text-label-2">Stamp</p>
          <p className={`text-[17px] font-semibold ${stamped ? "text-tint" : ""}`}>{stamped ? "Collected" : "Not yet"}</p>
        </div>
        <div className="rounded-[10px] bg-grouped px-3 py-2">
          <p className="text-[12px] uppercase text-label-2">From you</p>
          <p className="text-[17px] font-semibold">
            {km == null ? "—" : km < 2 ? `${walkMinutes(me!, station)} min walk` : `${km.toFixed(1)} km`}
          </p>
        </div>
      </div>
      {/* TODO(P4): "Check in" button -> POST /api/checkin; TODO(P1): "Food near here" from places client. */}
    </div>
  );
}
