// Owner: P4 - Game Layer & Map (see TEAM.md)
// The group Trip Map unlocks once the group has a place to eat: swiping produced its picks, or
// someone's trip is already heading to a place (e.g. the demo group).
"use client";

import { useEffect, useState } from "react";
import { fetchRoomTrips } from "@/features/trips/client";

type Pickish = { picks: readonly unknown[] } | null | undefined;

/** True once there's a place to go: the group's picks, or a trip that's heading somewhere. */
export function placeChosen(plan: Pickish, tripsDestination: unknown): boolean {
  return (plan?.picks.length ?? 0) > 0 || tripsDestination != null;
}

/** Whether anyone in the group already has a trip heading to a place (checked once). */
export function useTripsHeading(code: string): boolean {
  const [heading, setHeading] = useState(false);
  useEffect(() => {
    let active = true;
    fetchRoomTrips(code)
      .then((d) => active && setHeading(d.destination != null))
      .catch(() => {}); // not a member yet / offline: stays locked until swiping picks a place
    return () => {
      active = false;
    };
  }, [code]);
  return heading;
}
