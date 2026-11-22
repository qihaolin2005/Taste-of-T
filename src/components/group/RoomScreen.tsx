// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// One group: code + invite, join form (if you're not in yet), live member list.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, GroupIcon, ListRow, ListSection, MapIcon, Screen } from "@/components/shared/ios";
import type { StationOption } from "@/components/shared/StationPicker";
import { deleteRoom, joinRoom, leaveRoom } from "@/features/rooms/client";
import type { RoomView } from "@/features/rooms/roomStore";
import { useRoomPolling } from "@/features/rooms/useRoomPolling";
import { formatMinutes } from "@/lib/time";
import MemberForm from "./MemberForm";
import ShareLink from "./ShareLink";
import SquadSession from "./SquadSession";

const STOP_LABEL = { dinner: "Dinner", dessert: "Dessert", "late-night": "Late-Night Bites", activity: "Activity" } as const;
const back = { href: "/room/new", label: "Adventure" };

function whenText(room: RoomView): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const day = room.date === today ? "Tonight" : new Date(`${room.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  return `${day} · ${formatMinutes(room.startTime)} · ${room.slots.map((s) => STOP_LABEL[s]).join(" → ")}`;
}

function Badge({ children, tone }: { children: string; tone: "tint" | "plain" }) {
  return (
    <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[12px] font-semibold ${tone === "tint" ? "bg-tint/15 text-tint" : "bg-cell-2 text-label-2"}`}>{children}</span>
  );
}

export default function RoomScreen({ code, stations }: { code: string; stations: readonly StationOption[] }) {
  const router = useRouter();
  const { state, setRoom } = useRoomPolling(code);
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Next keeps this page alive after you leave it; don't come back to a stuck "Leaving…".
  useEffect(() => () => setLeaving(false), []);
  const stationName = (id: string) => stations.find((s) => s.id === id)?.name ?? id;

  if (state.status === "loading") {
    return (
      <Screen title="Group" tab="night" back={back}>
        <p className="mt-6 text-center text-[15px] text-label-2">Loading group {code.toUpperCase()}…</p>
      </Screen>
    );
  }

  if (state.status !== "ready") {
    return (
      <Screen title="Group" tab="night" back={back}>
        <div className="mt-3 rounded-[10px] bg-cell px-4 py-10 text-center">
          <p className="text-[17px] font-semibold">{state.status === "not-found" ? "Group not found" : "Couldn't load the group"}</p>
          <p className="mt-1 text-[15px] text-label-2">{state.message}</p>
        </div>
        <div className="mt-6">
          <Button href="/room/new" variant="tinted">
            Try Another Code
          </Button>
        </div>
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
      router.push("/room/new");
    }
  }

  /** Host only: ends the group for everyone (they go back to "join or start"). */
  async function endGroup() {
    if (!window.confirm(`Delete ${room.name} for everyone? This can't be undone.`)) return;
    setLeaving(true);
    try {
      await deleteRoom(room.code);
      router.push("/room/new");
    } catch {
      setLeaving(false);
    }
  }

  return (
    // In the group (or hosting it), the Adventure tab brings you right back here, so no back link.
    <Screen title={room.name} tab="night" back={room.you || room.youAreHost ? undefined : back}>
      <p className="-mt-1 text-[15px] text-label-2">{whenText(room)}</p>
      <ShareLink code={room.code} name={room.name} />

      {!you || editing ? (
        <MemberForm stations={stations} existing={you} submitLabel={you ? "Save" : "Join Group"} onSubmit={submit} />
      ) : (
        <ListSection header="Your Info">
          <ListRow title="Starting from" value={stationName(you.startStationId)} />
          <ListRow title="Going home to" value={stationName(you.homeStationId)} />
          <ListRow title="Budget" value={`$${you.budget}`} />
          {you.leaveBy != null && <ListRow title="Leaving" value={`By ${formatMinutes(you.leaveBy)}`} />}
          <ListRow title="Edit my info" onClick={() => setEditing(true)} />
        </ListSection>
      )}

      <ListSection
        header={`Who's Coming (${room.members.length}/${room.maxMembers})`}
        footer={room.members.length < 2 ? "Share the code. New people show up here automatically." : undefined}
      >
        {room.members.length === 0 ? (
          <ListRow title="Nobody yet" subtitle="Join first, then invite friends" />
        ) : (
          room.members.map((m) => (
            <ListRow
              key={m.id}
              icon={<GroupIcon size={17} />}
              iconBg={m.isYou ? "var(--tint)" : "#8e8e93"}
              title={
                <>
                  {m.name}
                  {m.isYou && <Badge tone="tint">You</Badge>}
                  {m.isHost && <Badge tone="plain">Host</Badge>}
                </>
              }
              subtitle={`From ${m.startStation.name}`}
            />
          ))
        )}
      </ListSection>

      {you && !editing && (
        <>
          {/* The swipe session: host starts, everyone swipes 10 places, top 5 (src/features/squads). */}
          <SquadSession code={room.code} />
          <ListSection footer="Record your way there and see everyone's paths on one map.">
            <ListRow icon={<MapIcon size={16} />} iconBg="#ff375f" title="Trip Map" subtitle="Everyone's path to the restaurant" href={`/room/${room.code}/trips`} />
          </ListSection>
          <ListSection footer={room.youAreHost ? "If you leave, the next person who joined becomes host." : undefined}>
            <ListRow title={leaving ? "Leaving…" : "Leave Group"} destructive onClick={leaving ? undefined : leave} />
          </ListSection>
        </>
      )}
      {room.youAreHost && !editing && (
        <ListSection footer="Ends the group for everyone. They can still claim points for tonight's picks.">
          <ListRow title="Delete Group" destructive onClick={leaving ? undefined : endGroup} />
        </ListSection>
      )}
    </Screen>
  );
}
