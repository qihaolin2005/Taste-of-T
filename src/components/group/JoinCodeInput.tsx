// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// "Join a Squad": enter a 4-letter code (e.g. BHSG). Four letter boxes over one real <input>,
// so typing, paste, and iOS autofill all just work. Once 4 letters are in, the group is looked
// up (GET /api/rooms/CODE) and shown as the Figma "invite found" preview before joining.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, fetchRoom } from "@/features/rooms/client";
import type { RoomView } from "@/features/rooms/roomStore";
import { Avatar, whenText } from "./squadUi";

const LENGTH = 4;
const ALLOWED = /[ABCDEFGHJKLMNPQRSTUVWXYZ]/g; // same alphabet as the server (no I or O)

type Preview = { status: "idle" } | { status: "loading" } | { status: "found"; room: RoomView } | { status: "missing" } | { status: "error"; message: string };

export default function JoinCodeInput() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const [preview, setPreview] = useState<Preview>({ status: "idle" });
  const ready = code.length === LENGTH;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    fetchRoom(code)
      .then((room) => !cancelled && setPreview({ status: "found", room }))
      .catch((err) => {
        if (cancelled) return;
        setPreview(err instanceof ApiError && err.status === 404 ? { status: "missing" } : { status: "error", message: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [code, ready]);

  function go() {
    if (preview.status === "found") router.push(`/room/${code}`);
  }

  const host = preview.status === "found" ? preview.room.members.find((m) => m.isHost)?.name : undefined;

  return (
    <form
      className="tot-squad-in"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <span className="mb-[7px] block text-[14px] font-bold text-label">Invite code</span>
      <label className="relative block cursor-text" aria-label="Group code">
        <input
          value={code}
          onChange={(e) => {
            const next = (e.target.value.toUpperCase().match(ALLOWED) ?? []).join("").slice(0, LENGTH);
            setCode(next);
            setPreview(next.length === LENGTH ? { status: "loading" } : { status: "idle" });
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={LENGTH + 4}
          className="absolute inset-0 h-full w-full opacity-0"
          aria-describedby="code-help"
        />
        <div className="grid grid-cols-4 gap-2.5" aria-hidden>
          {Array.from({ length: LENGTH }, (_, i) => {
            const active = focused && (i === code.length || (ready && i === LENGTH - 1));
            return (
              <span
                key={i}
                className={`flex h-[68px] items-center justify-center rounded-[15px] border bg-cell font-mono text-[30px] font-bold text-label transition-colors ${
                  active ? "border-tint ring-2 ring-tint/25" : "border-separator"
                }`}
              >
                {code[i] ?? ""}
              </span>
            );
          })}
        </div>
      </label>
      <p id="code-help" className="mt-2 text-[13px] text-label-2">
        Ask whoever started the night for their 4-letter code, or open the link they sent.
      </p>

      {/* Figma .join-preview */}
      <div className="my-[22px] min-h-[82px]" aria-live="polite">
        {preview.status === "loading" && <div className="h-[82px] animate-pulse rounded-[18px] bg-cell-2" aria-label="Looking up the code" />}
        {preview.status === "found" && (
          <div className="tot-squad-in flex items-center gap-[11px] rounded-[18px] bg-lavender p-[15px]">
            <Avatar name={preview.room.name} size={48} tone="purple" />
            <div className="grid min-w-0 gap-0.5">
              <small className="text-[11px] font-bold uppercase tracking-[0.06em] text-label-2">Invite found</small>
              <b className="truncate text-[16px] text-label">{preview.room.name}</b>
              <span className="text-[13px] text-label-2">
                {preview.room.members.length} {preview.room.members.length === 1 ? "member" : "members"}
                {host ? ` · ${host} is hosting` : ""}
              </span>
              <span className="text-[13px] text-label-2">{whenText(preview.room)}</span>
            </div>
          </div>
        )}
        {preview.status === "missing" && (
          <p role="alert" className="rounded-[18px] bg-[#fbeff4] px-4 py-3 text-[14px] leading-5 text-[#8c456c]">
            No squad with the code {code}. Check the letters, or it may have ended.
          </p>
        )}
        {preview.status === "error" && (
          <p role="alert" className="rounded-[18px] bg-[#fbeff4] px-4 py-3 text-[14px] leading-5 text-[#8c456c]">
            Couldn’t check that code: {preview.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={preview.status !== "found"}
        className="flex min-h-[54px] w-full items-center justify-center rounded-[17px] bg-tint text-[16px] font-bold text-tint-fg shadow-[0_9px_20px_rgb(121_84_172/0.18)] transition active:scale-[0.98] disabled:opacity-45"
      >
        {preview.status === "found" && preview.room.you ? "Open Squad" : "Join Squad"}
      </button>
    </form>
  );
}
