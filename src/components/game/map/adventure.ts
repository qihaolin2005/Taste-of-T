// Owner: P4 - Game Layer & Map (see TEAM.md)
// The T map's adventure view. When you're in a group that has somewhere to go (its top pick, or a
// trip someone started), the map shows that place, everyone's live position, and the path each of
// them took so far, drawn as it grows (Strava-style), refreshed every 10 s while anyone is on
// the way. Data: GET /api/rooms (your group), /api/rooms/CODE/trips and /api/rooms/CODE/plan.
// Other people's paths start 200 m from where they really started (privacy zone, server side).
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LatLng } from "@/lib/geo";
import type { SquadPlan } from "@/features/ml";
import { fetchCurrentRoom } from "@/features/rooms/client";
import { fetchRoomTrips } from "@/features/trips/client";
import type { TripView } from "@/features/trips/service";
import type { CrewTrail } from "./types";

export const ADVENTURE_POLL_MS = 10_000;

/** One color per person, distinct on light and dark maps (same order as the group Trip Map). */
export const CREW_COLORS = ["#0a84ff", "#ff375f", "#30d158", "#ff9f0a", "#bf5af2", "#64d2ff", "#ffd60a", "#ac8e68", "#5e5ce6", "#ff6961", "#66d4cf", "#e5e5ea"];

export type AdventurePlace = LatLng & { id: string; name?: string };

export type Adventure = {
  code: string;
  destination: AdventurePlace | null;
  crew: CrewTrail[];
  arrived: number;
  onTheWay: number;
};

type CrewTrip = Pick<TripView, "id" | "isYou" | "name" | "status" | "arrived" | "legs">;

/** Trips (you first, as the server sends them) -> what the map draws. */
export function toCrew(trips: readonly CrewTrip[], colors: readonly string[] = CREW_COLORS): CrewTrail[] {
  return trips.map((t, i) => {
    const legs = t.legs.filter((l) => l.path.length > 0).map((l) => ({ transit: l.mode === "transit", path: l.path.map(([lat, lng]) => ({ lat, lng })) }));
    return {
      id: t.id,
      label: t.isYou ? "You" : (t.name ?? "Member"),
      you: t.isYou,
      color: colors[i % colors.length],
      live: t.status === "recording",
      arrived: t.arrived,
      legs,
      at: legs.at(-1)?.path.at(-1) ?? null,
    };
  });
}

type PlacePick = { place: { id: string; name?: string | null; lat?: number | null; lng?: number | null } };

/** Where the adventure goes: where the group's trips are heading, else the group's top pick. */
export function adventureDestination(tripsPlace: TripView["place"], picks: readonly PlacePick[] = []): AdventurePlace | null {
  if (tripsPlace) return { id: tripsPlace.id, lat: tripsPlace.lat, lng: tripsPlace.lng, ...(tripsPlace.name ? { name: tripsPlace.name } : {}) };
  const top = picks.find((p) => typeof p.place.lat === "number" && typeof p.place.lng === "number");
  if (!top) return null;
  return { id: top.place.id, lat: top.place.lat!, lng: top.place.lng!, ...(top.place.name ? { name: top.place.name } : {}) };
}

type Raw = { code: string; trips: TripView[]; destination: AdventurePlace | null };

const placeKey = (p: AdventurePlace | null) => (p ? `${p.id}|${p.lat}|${p.lng}|${p.name ?? ""}` : "");

async function fetchPicks(code: string): Promise<PlacePick[]> {
  const r = await fetch(`/api/rooms/${encodeURIComponent(code)}/plan`, { cache: "no-store" });
  if (!r.ok) return [];
  const body = (await r.json().catch(() => null)) as { plan: SquadPlan | null } | null;
  return body?.plan?.picks ?? [];
}

/**
 * Your group's adventure, or null when you're not in one (or it has nowhere to go yet).
 * `enabled` false skips it entirely (e.g. while the map is routing somewhere else).
 */
export function useAdventure(enabled = true): Adventure | null {
  const [code, setCode] = useState<string | null>(null);
  const [raw, setRaw] = useState<Raw | null>(null);

  // Which group you're in (once per visit to the map).
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchCurrentRoom()
      .then((c) => active && setCode(c))
      .catch(() => active && setCode(null)); // signed out / offline: just the T map
    return () => {
      active = false;
    };
  }, [enabled]);

  const load = useCallback(async (c: string) => {
    const [trips, picks] = await Promise.all([fetchRoomTrips(c), fetchPicks(c).catch(() => [])]);
    const next = adventureDestination(trips.destination, picks);
    // Keep the same destination object across polls so the route isn't re-planned every 10 s.
    setRaw((prev) => ({ code: c, trips: trips.trips, destination: prev && placeKey(prev.destination) === placeKey(next) ? prev.destination : next }));
  }, []);

  const onTheWay = raw?.trips.some((t) => t.status === "recording") ?? false;
  useEffect(() => {
    if (!enabled || !code) return;
    const tick = () => {
      if (document.visibilityState === "visible") load(code).catch(() => {}); // keep the last good view
    };
    tick();
    // Live while anyone is on the way; otherwise check now and then for someone starting.
    const id = setInterval(tick, onTheWay ? ADVENTURE_POLL_MS : ADVENTURE_POLL_MS * 3);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, code, load, onTheWay]);

  return useMemo(() => {
    if (!enabled || !code || !raw || raw.code !== code) return null;
    const crew = toCrew(raw.trips);
    if (!raw.destination && crew.length === 0) return null;
    return { code, destination: raw.destination, crew, arrived: crew.filter((c) => c.arrived).length, onTheWay: crew.filter((c) => c.live).length };
  }, [enabled, code, raw]);
}

/** Changes only when someone joins the map or the place changes: when to re-frame the view. */
export const crewKey = (crew: readonly CrewTrail[] | undefined, destination?: LatLng | null) =>
  `${(crew ?? []).map((c) => c.id).join(",")}|${destination ? `${destination.lat},${destination.lng}` : ""}`;
