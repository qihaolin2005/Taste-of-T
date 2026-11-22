// Owner: P4 - Game Layer & Map (see TEAM.md)
// /trips: record a solo trip, your group outings (each opens its group map), and solo trips.
"use client";

import { useCallback, useEffect, useState } from "react";
import { GroupIcon, ListRow, ListSection, MapIcon, Screen } from "@/components/shared/ios";
import { fetchMyGroupTrips, fetchMyTrips } from "@/features/trips/client";
import type { GroupTripSummary, TripView } from "@/features/trips/service";
import { dayText, duration, howText, miles, statusText, whenText } from "./format";
import TripRecorderCard from "./TripRecorderCard";

export default function MyTripsScreen() {
  const [trips, setTrips] = useState<TripView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMyTrips().then(setTrips, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  // Group outings: one button each, opening the group map (everyone's paths), then each person's.
  const [groups, setGroups] = useState<GroupTripSummary[] | null>(null);
  useEffect(() => {
    fetchMyGroupTrips().then(setGroups, () => setGroups([]));
  }, []);

  const upsert = (t: TripView) => setTrips((list) => [t, ...(list ?? []).filter((x) => x.id !== t.id)]);
  const current = trips?.find((t) => t.status === "recording" && !t.roomId) ?? null;
  // Solo trips only: group trips live under their group above. The trip in the recorder card
  // isn't "past" yet either.
  const past = trips?.filter((t) => !t.roomId && t.id !== current?.id) ?? null;

  return (
    <Screen title="My Trips" tab="profile" back={{ href: "/profile", label: "Profile" }}>
      <TripRecorderCard current={current} onChange={upsert} />

      {groups && groups.length > 0 && (
        <ListSection header="Group Trips" footer="See everyone's way there on one map, then each person's trip.">
          {groups.map((g) => (
            <ListRow
              key={g.roomId}
              href={`/room/${g.roomId}/trips`}
              icon={<GroupIcon size={17} />}
              title={g.name}
              subtitle={[dayText(g.date), g.place?.name, `${g.people} ${g.people === 1 ? "person" : "people"}`, g.ended ? null : "live now"].filter(Boolean).join(" · ")}
              value={g.ended ? undefined : <span className="text-[13px] font-semibold text-tint">Live</span>}
            />
          ))}
        </ListSection>
      )}

      <ListSection header={groups?.length ? "Solo Trips" : "Past Trips"}>
        {error ? (
          <ListRow title="Couldn't load trips" subtitle={error} />
        ) : !past ? (
          <ListRow title="Loading…" />
        ) : past.length === 0 ? (
          <ListRow title="No trips yet" subtitle={current ? "Your trip in progress shows up here when it ends" : "Start one on your way to dinner"} />
        ) : (
          past.map((t) => (
            <ListRow
              key={t.id}
              href={`/trips/${t.id}`}
              icon={<MapIcon size={16} />}
              iconBg={t.status === "recording" ? "#ff375f" : t.roomId ? "#5856d6" : "var(--tint)"}
              title={t.place?.name ?? (t.roomId ? `Group ${t.roomId}` : "Trip")}
              subtitle={`${whenText(t.startedAt)} · ${miles(t.distanceM)} · ${duration(t.durationSec)} · ${t.status === "recording" ? statusText(t) : howText(t)}`}
            />
          ))
        )}
      </ListSection>
    </Screen>
  );
}
