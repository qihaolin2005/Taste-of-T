// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Squads (the Night tab), laid out like the Figma Make "Squads" screens:
//   dashboard  your live groups as squad cards (GET /api/rooms), Create / Join / Invite,
//              and the Figma empty state
//   ?view=create  "Create a Squad" (POST /api/rooms, then the group page shows the code)
//   ?view=join    "Join a Squad" with a live invite preview (GET /api/rooms/CODE)
// A "squad" here is a group night (a room): it lasts until its night is over. Lasting squads,
// friends, and squad activity need a backend that doesn't exist yet, so they're labeled.
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GroupIcon, ShareIcon } from "@/components/shared/ios";
import { listMyRooms } from "@/features/rooms/client";
import type { RoomSummary } from "@/features/rooms/roomStore";
import CreateRoomForm from "./CreateRoomForm";
import JoinCodeInput from "./JoinCodeInput";
import { AvatarStack, PlusButton, SquadHeader, Unavailable, whenText } from "./squadUi";
import "./squads.css";

type View = "dashboard" | "create" | "join";

function viewFromUrl(): View {
  const v = new URLSearchParams(window.location.search).get("view");
  return v === "create" || v === "join" ? v : "dashboard";
}

function PlusGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Figma .squad-card (the first one is the lavender card). */
function SquadCard({ room, highlight }: { room: RoomSummary; highlight: boolean }) {
  const names = room.members.map((m) => m.name);
  const status = !room.youJoined ? "Add your info to join in" : room.youAreHost ? "You’re hosting" : "You’re in";
  return (
    <Link
      href={`/room/${room.code}`}
      className={`tot-squad-in mb-3 block rounded-[22px] border p-[18px] transition active:scale-[0.99] ${highlight ? "border-lavender bg-lavender" : "border-separator bg-cell"}`}
    >
      <div className="flex items-center justify-between">
        {names.length ? <AvatarStack names={names} /> : <span className="text-[13px] text-label-2">No one has joined yet</span>}
        <span className="text-[13px] text-label-2">
          {room.members.length} {room.members.length === 1 ? "member" : "members"}
        </span>
      </div>
      <h2 className="mb-1 mt-3.5 text-[20px] font-bold tracking-[-0.02em] text-label">{room.name}</h2>
      <p className="text-[14px] text-label-2">{whenText(room)}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${room.youJoined ? "bg-cell text-plum" : "bg-tint text-tint-fg"}`}>{status}</span>
        <span className="font-mono text-[13px] font-bold tracking-[0.2em] text-label-2">{room.code}</span>
      </div>
      <span className="mt-3.5 flex min-h-[44px] items-center justify-center gap-1.5 rounded-[13px] bg-cell text-[14px] font-bold text-label">View Squad →</span>
    </Link>
  );
}

export default function SquadsHub() {
  const [view, setView] = useState<View>("dashboard");
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listMyRooms()
      .then(setRooms)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    listMyRooms()
      .then((r) => !cancelled && setRooms(r))
      .catch((err: Error) => !cancelled && setError(err.message));
    // open ?view=create / ?view=join links directly (after hydration), and follow the back button
    const sync = () => setView(viewFromUrl());
    const frame = requestAnimationFrame(sync);
    window.addEventListener("popstate", sync);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  function goTo(next: View) {
    window.history.pushState(null, "", next === "dashboard" ? window.location.pathname : `${window.location.pathname}?view=${next}`);
    setView(next);
    window.scrollTo(0, 0);
  }
  /** × always lands on the dashboard, even when the page was opened on ?view=join directly. */
  function close() {
    window.history.replaceState(null, "", window.location.pathname);
    setView("dashboard");
    window.scrollTo(0, 0);
  }

  async function invite() {
    const room = rooms?.find((r) => r.youJoined) ?? rooms?.[0];
    if (!room) return;
    const url = `${window.location.origin}/room/${room.code}`;
    const text = `Join "${room.name}" on Taste of T with code ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Taste of T", text, url });
      else {
        await navigator.clipboard.writeText(`${text}: ${url}`);
        setInviteNote(`Copied the invite for ${room.name}.`);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      await navigator.clipboard
        .writeText(`${text}: ${url}`)
        .then(() => setInviteNote(`Copied the invite for ${room.name}.`))
        .catch(() => setInviteNote(`Share code ${room.code} with your friends.`));
    }
  }

  if (view === "create") {
    return (
      <div className="tot-squad-view">
        <SquadHeader title="Create a Squad" subtitle="Make a home for your favorite explorers." onClose={close} />
        <CreateRoomForm />
      </div>
    );
  }

  if (view === "join") {
    return (
      <div className="tot-squad-view">
        <SquadHeader title="Join a Squad" subtitle="Enter the invite code your friend shared." onClose={close} />
        <JoinCodeInput />
      </div>
    );
  }

  const hasRooms = !!rooms && rooms.length > 0;
  return (
    <div className="tot-squad-view">
      <SquadHeader title="Squads" subtitle="Better adventures together." action={<PlusButton onClick={() => goTo("create")} label="Create a squad" />} />

      {/* Figma .squad-actions */}
      <div className="mb-3.5 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => goTo("create")} className="flex h-12 items-center justify-center gap-1.5 rounded-[15px] border border-separator bg-cell text-[14px] font-bold text-label active:scale-[0.98]">
          <PlusGlyph /> Create
        </button>
        <button type="button" onClick={() => goTo("join")} className="flex h-12 items-center justify-center gap-1.5 rounded-[15px] border border-separator bg-cell text-[14px] font-bold text-label active:scale-[0.98]">
          <GroupIcon size={17} /> Join
        </button>
        <button
          type="button"
          onClick={invite}
          disabled={!hasRooms}
          title={hasRooms ? undefined : "Create or join a squad first"}
          className="flex h-12 items-center justify-center gap-1.5 rounded-[15px] border border-separator bg-cell text-[14px] font-bold text-label active:scale-[0.98] disabled:opacity-45"
        >
          <ShareIcon size={16} /> Invite
        </button>
      </div>
      {inviteNote && (
        <p role="status" className="-mt-1.5 mb-3 text-center text-[13px] text-label-2">
          {inviteNote}
        </p>
      )}

      {error ? (
        <section className="rounded-[18px] border border-separator bg-cell px-4 py-6 text-center">
          <b className="text-[15px] text-label">Couldn’t load your squads</b>
          <p className="mt-1 text-[13px] text-label-2">{error}</p>
          <button type="button" onClick={load} className="mx-auto mt-3 flex min-h-10 items-center rounded-full bg-lavender px-5 text-[14px] font-bold text-plum">
            Try again
          </button>
        </section>
      ) : rooms == null ? (
        <div aria-label="Loading squads">
          {[0, 1].map((i) => (
            <div key={i} className="mb-3 h-[214px] animate-pulse rounded-[22px] bg-cell-2" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        // Figma .squad-empty
        <section className="tot-squad-in rounded-[18px] border border-dashed border-separator bg-cell px-[14px] py-6 text-center">
          <span className="mx-auto mb-2.5 grid size-10 place-items-center rounded-[13px] bg-lavender text-plum">
            <GroupIcon size={20} />
          </span>
          <b className="text-[16px] text-label">Your adventures need a crew</b>
          <p className="mx-auto mb-4 mt-1 max-w-[280px] text-[14px] leading-[1.45] text-label-2">Create a squad or join one with an invite code.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => goTo("create")} className="min-h-11 rounded-[12px] bg-lavender text-[14px] font-bold text-plum active:scale-[0.98]">
              Create a squad
            </button>
            <button type="button" onClick={() => goTo("join")} className="min-h-11 rounded-[12px] bg-nav text-[14px] font-bold text-white active:scale-[0.98]">
              Join with a code
            </button>
          </div>
        </section>
      ) : (
        rooms.map((r, i) => <SquadCard key={r.code} room={r} highlight={i === 0} />)
      )}

      <div className="mt-4">
        <Unavailable title="Friends & lasting squads are coming soon">
          Squads last for one night out for now. Finding friends, following explorers, and squad activity need a backend that isn’t built yet. Share your squad code to invite people.
        </Unavailable>
      </div>
    </div>
  );
}
