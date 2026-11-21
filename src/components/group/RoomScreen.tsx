// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// One group (Figma "squad profile"): cover, squad name + members, invite code, your info or
// the join form (Night Out planner fields), the live member list, and what's next: Plan the
// Night and the group Trip Map (P4's GroupTripsScreen at /room/CODE/trips, unchanged).
// Data: GET /api/rooms/CODE polled every few seconds; join/update/leave via /members.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronRight, GroupIcon, MapIcon, Screen } from "@/components/shared/ios";
import type { StationOption } from "@/components/shared/StationPicker";
import { joinRoom, leaveRoom } from "@/features/rooms/client";
import { useRoomPolling } from "@/features/rooms/useRoomPolling";
import { formatMinutes } from "@/lib/time";
import MemberForm from "./MemberForm";
import ShareLink from "./ShareLink";
import { Avatar, AvatarStack, whenText } from "./squadUi";
import "./squads.css";

const DASHBOARD = "/room/new";

function Cover({ children }: { children?: ReactNode }) {
  return (
    <div className="tot-squad-cover" aria-hidden={!children}>
      <svg viewBox="0 0 393 150" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d="M-20 98C70 98 60 52 150 52s92 58 170 58 52-40 110-40" />
        <circle cx="40" cy="96" r="7" />
        <circle cx="150" cy="52" r="7" />
        <circle cx="322" cy="110" r="7" />
      </svg>
      {children}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href={DASHBOARD}
      aria-label="Back to squads"
      className="absolute left-0 top-[calc(var(--safe-top)+12px)] z-10 ml-5 grid size-11 place-items-center rounded-full bg-cell text-label shadow-[0_4px_14px_rgb(48_32_63/0.14)] active:scale-95"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
    </Link>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-7 text-[20px] font-bold tracking-[-0.03em] text-label">{children}</h2>;
}

function Tag({ children, tone }: { children: string; tone: "tint" | "plain" }) {
  return <span className={`ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone === "tint" ? "bg-tint text-tint-fg" : "bg-cell-2 text-label-2"}`}>{children}</span>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between border-b border-separator px-[14px] last:border-b-0">
      <span className="text-[14px] text-label-2">{label}</span>
      <b className="text-[15px] text-label">{value}</b>
    </div>
  );
}

export default function RoomScreen({ code, stations }: { code: string; stations: readonly StationOption[] }) {
  const router = useRouter();
  const { state, setRoom } = useRoomPolling(code);
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const stationName = (id: string) => stations.find((s) => s.id === id)?.name ?? id;

  if (state.status === "loading") {
    return (
      <Screen title="Squad" tab="night" hideHeader>
        <Cover />
        <BackLink />
        <div className="-mt-9 grid justify-items-center gap-3" aria-label={`Loading squad ${code.toUpperCase()}`}>
          <span className="size-[72px] animate-pulse rounded-full border-2 border-cell bg-cell-2" />
          <span className="h-7 w-44 animate-pulse rounded-full bg-cell-2" />
          <span className="h-[150px] w-full animate-pulse rounded-[20px] bg-cell-2" />
        </div>
      </Screen>
    );
  }

  if (state.status !== "ready") {
    return (
      <Screen title="Squad" tab="night" hideHeader>
        <Cover />
        <BackLink />
        <section className="tot-squad-in mt-5 rounded-[20px] border border-separator bg-cell px-5 py-8 text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-[15px] bg-lavender text-plum">
            <GroupIcon size={22} />
          </span>
          <b className="text-[18px] text-label">{state.status === "not-found" ? "Squad not found" : "Couldn’t load the squad"}</b>
          <p className="mx-auto mt-1 max-w-[290px] text-[14px] text-label-2">{state.message}</p>
          <Link href={`${DASHBOARD}?view=join`} className="mx-auto mt-5 flex min-h-12 max-w-[260px] items-center justify-center rounded-full bg-lavender text-[15px] font-bold text-plum">
            Try another code
          </Link>
        </section>
      </Screen>
    );
  }

  const room = state.room;
  const you = room.you;

  async function submit(input: Parameters<typeof joinRoom>[1]) {
    setRoom(await joinRoom(room.code, input));
    setEditing(false);
  }

  async function leave() {
    setLeaving(true);
    try {
      await leaveRoom(room.code);
    } finally {
      router.push(DASHBOARD);
    }
  }

  return (
    <Screen title={room.name} tab="night" hideHeader>
      <Cover />
      <BackLink />

      {/* Figma .squad-profile-head */}
      <section className="tot-squad-in relative -mt-9 text-center">
        <span className="mx-auto block w-fit">
          <Avatar name={room.name} size={72} tone="purple" />
        </span>
        <small className="mt-2.5 block text-[12px] font-bold uppercase tracking-[0.08em] text-label-2">
          {you ? "Your squad" : "Squad invite"} · {room.members.length} {room.members.length === 1 ? "member" : "members"}
        </small>
        <h1 className="mt-1 font-serif text-[31px] font-normal leading-[1.1] tracking-[-0.025em] text-label">{room.name}</h1>
        <p className="mt-1 text-[14px] text-label-2">{whenText(room)}</p>
        {room.members.length > 0 && (
          <div className="mt-3 flex justify-center">
            <AvatarStack names={room.members.map((m) => m.name)} max={6} />
          </div>
        )}
      </section>

      <div className="mt-5">
        <ShareLink code={room.code} name={room.name} />
      </div>

      {!you || editing ? (
        <MemberForm stations={stations} existing={you} submitLabel={you ? "Save" : "Join Squad"} onSubmit={submit} onCancel={editing ? () => setEditing(false) : undefined} />
      ) : (
        <>
          <SectionTitle>Your info</SectionTitle>
          <section className="overflow-hidden rounded-[18px] border border-separator bg-cell">
            <InfoRow label="Starting from" value={stationName(you.startStationId)} />
            <InfoRow label="Going home to" value={stationName(you.homeStationId)} />
            <InfoRow label="Budget" value={`$${you.budget}`} />
            {you.leaveBy != null && <InfoRow label="Leaving" value={`By ${formatMinutes(you.leaveBy)}`} />}
            <button type="button" onClick={() => setEditing(true)} className="flex min-h-[48px] w-full items-center justify-between px-[14px] text-left text-[14px] font-bold text-tint active:bg-cell-2">
              Edit my info <ChevronRight className="text-label-3" />
            </button>
          </section>
        </>
      )}

      {/* Figma .member-list */}
      <SectionTitle>{`Members (${room.members.length}/${room.maxMembers})`}</SectionTitle>
      {room.members.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-separator bg-cell px-4 py-4 text-center text-[14px] text-label-2">Nobody yet. Join first, then share the code.</p>
      ) : (
        <div className="grid gap-[7px]">
          {room.members.map((m, i) => (
            <div key={m.id} className="tot-squad-in grid min-h-[56px] grid-cols-[38px_1fr] items-center gap-2.5 rounded-[14px] bg-cell px-2.5" style={{ animationDelay: `${i * 40}ms` }}>
              <Avatar name={m.name} size={36} tone={m.isYou ? "purple" : i % 2 ? "pink" : "lilac"} />
              <div className="min-w-0">
                <b className="flex items-center text-[15px] text-label">
                  <span className="truncate">{m.name}</span>
                  {m.isYou && <Tag tone="tint">You</Tag>}
                  {m.isHost && <Tag tone="plain">Host</Tag>}
                </b>
                <small className="block truncate text-[13px] text-label-2">From {m.startStation.name}</small>
              </div>
            </div>
          ))}
        </div>
      )}
      {room.members.length < 2 && <p className="mt-2 px-1 text-[13px] text-label-2">Share the code. New people show up here automatically.</p>}

      {you && !editing && (
        <>
          <SectionTitle>Up next</SectionTitle>
          {/* TODO(P1): the plan page lights up once generatePlan() / the squad swipe API land. */}
          <Link
            href={`/room/${room.code}/plan`}
            className="flex min-h-[54px] items-center justify-center gap-2 rounded-[17px] bg-tint text-[16px] font-bold text-tint-fg shadow-[0_9px_20px_rgb(121_84_172/0.18)] transition active:scale-[0.98]"
          >
            Plan a Group Adventure →
          </Link>
          {/* Figma .upcoming-trip card -> the group trip map (P4) */}
          <Link href={`/room/${room.code}/trips`} className="mt-2.5 grid grid-cols-[46px_1fr_18px] items-center gap-3 rounded-[18px] border border-separator bg-cell p-[11px] active:bg-cell-2">
            <span className="grid size-[46px] place-items-center rounded-[13px] bg-lavender text-plum">
              <MapIcon size={20} />
            </span>
            <span className="grid min-w-0 gap-0.5">
              <b className="text-[15px] text-label">Trip Map</b>
              <small className="text-[13px] text-label-2">Record your way there and see everyone’s path</small>
            </span>
            <ChevronRight className="text-label-3" />
          </Link>
          <button type="button" onClick={leaving ? undefined : leave} className="mt-6 min-h-11 w-full rounded-[14px] text-[15px] font-bold text-danger active:bg-cell-2">
            {leaving ? "Leaving…" : "Leave Squad"}
          </button>
        </>
      )}
    </Screen>
  );
}
