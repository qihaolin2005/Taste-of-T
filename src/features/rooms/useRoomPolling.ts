// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Client hook: load a room and refresh it every few seconds (while the tab is visible),
// so people see friends join in near-real time without websockets.
"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchRoom } from "./client";
import type { RoomView } from "./roomStore";

const POLL_MS = 4000;

export type RoomState =
  | { status: "loading" }
  | { status: "ready"; room: RoomView }
  | { status: "not-found"; message: string }
  | { status: "error"; message: string };

export function useRoomPolling(code: string) {
  const [state, setState] = useState<RoomState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const room = await fetchRoom(code);
      setState({ status: "ready", room });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState({ status: "not-found", message: err.message });
      // Keep showing the last good room on a transient error (e.g. phone briefly offline).
      else setState((s) => (s.status === "ready" ? s : { status: "error", message: (err as Error).message }));
    }
  }, [code]);

  useEffect(() => {
    let stopped = false;
    const tick = () => {
      if (!stopped && document.visibilityState === "visible") void refresh();
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  /** Show a fresh RoomView right away (e.g. the response from joining). */
  const setRoom = useCallback((room: RoomView) => setState({ status: "ready", room }), []);

  return { state, refresh, setRoom };
}
