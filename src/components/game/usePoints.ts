// Owner: P4 - Game Layer & Map (see TEAM.md)
// Client hook: the signed-in user's points total and recent history.
"use client";

import { useEffect, useState } from "react";
import type { PointsSummary } from "@/features/gamification/points";

export function usePoints(): PointsSummary | null {
  const [points, setPoints] = useState<PointsSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/points", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<PointsSummary>) : null))
      .then((p) => !cancelled && p && setPoints(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return points;
}

export const formatPoints = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "point" : "points"}`;
