// Owner: P1 - Planner & Quests (see TEAM.md)
// Adventure tab gate: if you're already in a group (member or host), go back to it. You stay with
// that group until you leave it, the host deletes it, everyone leaves, or it expires
// (currentRoomCode in src/features/rooms/roomStore.ts). Only with no group do you see "join or
// start" (the children).
//
// Re-checks every time the tab is shown: Next keeps a page's state while you're on another page, so
// coming back from Claim Points must not show an old form (a stuck "Creating…") or skip the check.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { fetchCurrentRoom } from "@/features/rooms/client";

export default function CurrentGroupGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "none">("checking");

  useEffect(() => {
    let active = true;
    fetchCurrentRoom()
      .then((code) => {
        if (!active) return;
        if (code) router.replace(`/room/${code}`);
        else setState("none");
      })
      // Can't tell (offline, signed out): let them use the form; the server still enforces one group.
      .catch(() => active && setState("none"));
    return () => {
      active = false;
      // Hidden or left: check again (and rebuild the form fresh) next time this is shown.
      setState("checking");
    };
  }, [router]);

  if (state === "checking") return <p className="mt-6 text-center text-[15px] text-label-2">Checking for your group…</p>;
  return <>{children}</>;
}
