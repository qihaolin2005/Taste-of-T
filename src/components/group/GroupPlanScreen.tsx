// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// "Plan a Group Adventure" (Figma group adventure), honest about what exists today:
//   real    the night's stops and time, who's coming and where each person starts (live room
//           data), and the group Trip Map (P4)
//   missing generating the group's route: P1's generatePlan() / squad swipe service have no
//           API yet (/api/rooms/CODE/plan is a stub), so no places are invented here.
"use client";

import Link from "next/link";
import { ChevronRight, MapIcon, TrainIcon } from "@/components/shared/ios";
import { useRoomPolling } from "@/features/rooms/useRoomPolling";
import { Avatar, SquadHeader, Unavailable, whenText } from "./squadUi";
import "./squads.css";

const STOP_LABEL = { dinner: "Dinner", dessert: "Dessert or boba", activity: "Activity" } as const;

export default function GroupPlanScreen({ code }: { code: string }) {
  const { state } = useRoomPolling(code);
  const back = `/room/${code}`;

  if (state.status === "loading") {
    return (
      <div aria-label="Loading plan">
        <SquadHeader title="Group Adventure" subtitle="Loading…" back={back} />
        <div className="h-[260px] animate-pulse rounded-[20px] bg-cell-2" />
      </div>
    );
  }
  if (state.status !== "ready") {
    return (
      <div>
        <SquadHeader title="Group Adventure" back="/room/new" />
        <section className="rounded-[20px] border border-separator bg-cell px-5 py-8 text-center">
          <b className="text-[17px] text-label">{state.status === "not-found" ? "Squad not found" : "Couldn’t load the squad"}</b>
          <p className="mt-1 text-[14px] text-label-2">{state.message}</p>
        </section>
      </div>
    );
  }

  const room = state.room;
  // Starting stations, grouped: "Park Street · Ana, Ben"
  const starts = new Map<string, string[]>();
  for (const m of room.members) starts.set(m.startStation.name, [...(starts.get(m.startStation.name) ?? []), m.name]);

  return (
    <div className="tot-squad-view">
      <SquadHeader title="Group Adventure" subtitle={`${room.name} · ${whenText(room)}`} back={back} />

      <div className="mb-[18px] flex flex-wrap gap-1.5">
        {[`${room.members.length} going`, `${room.slots.length} ${room.slots.length === 1 ? "stop" : "stops"}`, "Budgets stay private"].map((c) => (
          <span key={c} className="rounded-full bg-lavender px-3 py-1.5 text-[13px] font-medium text-plum">
            {c}
          </span>
        ))}
      </div>

      {/* Figma .adventure-squad */}
      <section className="mb-3 grid grid-cols-[42px_1fr] items-center gap-2.5 rounded-[18px] bg-lavender p-[12px]">
        <Avatar name={room.name} size={42} tone="purple" />
        <div className="grid gap-0.5">
          <small className="text-[11px] font-bold uppercase tracking-[0.08em] text-label-2">Planned for</small>
          <b className="text-[15px] text-label">{room.name}</b>
          <span className="text-[13px] text-label-2">
            {room.members.length} {room.members.length === 1 ? "member" : "members"} included
          </span>
        </div>
      </section>

      <h2 className="mb-2.5 mt-6 text-[18px] font-bold text-label">Where everyone starts</h2>
      <div className="grid gap-[7px]">
        {[...starts].map(([station, names]) => (
          <div key={station} className="grid min-h-[54px] grid-cols-[38px_1fr] items-center gap-2.5 rounded-[14px] bg-cell px-2.5">
            <span className="grid size-9 place-items-center rounded-[11px] bg-lavender text-plum">
              <TrainIcon size={16} />
            </span>
            <div className="min-w-0">
              <b className="block truncate text-[15px] text-label">{station}</b>
              <small className="block truncate text-[13px] text-label-2">{names.join(", ")}</small>
            </div>
          </div>
        ))}
        {room.members.length === 0 && <p className="text-[14px] text-label-2">Nobody has joined yet.</p>}
      </div>

      <h2 className="mb-2.5 mt-6 text-[18px] font-bold text-label">The night</h2>
      <ol className="grid gap-[7px]">
        {room.slots.map((s, i) => (
          <li key={s} className="grid min-h-[54px] grid-cols-[30px_1fr] items-center gap-2.5 rounded-[14px] border border-dashed border-separator bg-cell px-3">
            <span className="grid size-[26px] place-items-center rounded-full border-2 border-tint text-[12px] font-extrabold text-label">{i + 1}</span>
            <div>
              <b className="text-[15px] text-label">{STOP_LABEL[s]}</b>
              <small className="block text-[13px] text-label-2">Place picked when group planning is ready</small>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <Unavailable title="Group route planning isn’t built yet">
          Picking places that work for everyone’s budget, tastes, and last train needs the group planner (P1). Until it ships, choose a spot together, then record your trips there on the Trip Map.
        </Unavailable>
      </div>

      <Link href={`/room/${code}/trips`} className="mt-3 grid grid-cols-[46px_1fr_18px] items-center gap-3 rounded-[18px] border border-separator bg-cell p-[11px] active:bg-cell-2">
        <span className="grid size-[46px] place-items-center rounded-[13px] bg-lavender text-plum">
          <MapIcon size={20} />
        </span>
        <span className="grid gap-0.5">
          <b className="text-[15px] text-label">Trip Map</b>
          <small className="text-[13px] text-label-2">Record your way there and see everyone’s path</small>
        </span>
        <ChevronRight className="text-label-3" />
      </Link>
      <Link href={back} className="mt-3 flex min-h-[48px] items-center justify-center rounded-[14px] bg-lavender text-[15px] font-bold text-plum">
        Back to squad
      </Link>
    </div>
  );
}
