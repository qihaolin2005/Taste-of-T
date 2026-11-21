// Owner: P4 - Game Layer & Map (see TEAM.md)
// /trips: record a solo trip and see your past trips.
"use client";

import { useCallback, useEffect, useState } from "react";
import { ListRow, ListSection, MapIcon, Screen } from "@/components/shared/ios";
import { fetchMyTrips } from "@/features/trips/client";
import type { TripView } from "@/features/trips/service";
import { duration, howText, miles, statusText, whenText } from "./format";
import TripRecorderCard from "./TripRecorderCard";

export default function MyTripsScreen() {
  const [trips, setTrips] = useState<TripView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMyTrips().then(setTrips, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const upsert = (t: TripView) => setTrips((list) => [t, ...(list ?? []).filter((x) => x.id !== t.id)]);
  const current = trips?.find((t) => t.status === "recording" && !t.roomId) ?? null;
  // The trip shown in the recorder card above isn't "past" yet, so leave it out of the list.
  const past = trips?.filter((t) => t.id !== current?.id) ?? null;

  return (
    <Screen title="My Trips" tab="profile" back={{ href: "/profile", label: "Profile" }}>
      <TripRecorderCard current={current} onChange={upsert} />

      <ListSection header="Past Trips" footer={past?.length ? "Group trips also show on that group's trip map." : undefined}>
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
