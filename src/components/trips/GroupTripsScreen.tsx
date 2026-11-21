// Owner: P4 - Game Layer & Map (see TEAM.md)
// /room/BHSG/trips: everyone's path to the restaurant on one map, Strava-style. Refreshes
// every 10 s while someone is still on the way.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ListRow, ListSection, Screen } from "@/components/shared/ios";
import { fetchRoomTrips } from "@/features/trips/client";
import type { TripView } from "@/features/trips/service";
import { duration, howText, miles, statusText } from "./format";
import TripMap, { TRIP_COLORS } from "./TripMap";
import TripRecorderCard from "./TripRecorderCard";

const POLL_MS = 10_000;

type Data = Awaited<ReturnType<typeof fetchRoomTrips>>;

function Swatch({ color }: { color: string }) {
  return <span className="block size-[14px] shrink-0 rounded-full border-2 border-white shadow" style={{ background: color }} />;
}

export default function GroupTripsScreen({ code }: { code: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = { href: `/room/${code}`, label: "Group" };

  const load = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    fetchRoomTrips(code).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [code]);

  const anyoneOnTheWay = data?.trips.some((t) => t.status === "recording") ?? true;
  useEffect(() => {
    load();
    if (!anyoneOnTheWay) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load, anyoneOnTheWay]);

  // Your own updates show right away instead of waiting for the next poll.
  const upsert = (t: TripView) =>
    setData((d) => d && { ...d, trips: [{ ...t, name: d.trips.find((x) => x.isYou)?.name ?? "You" }, ...d.trips.filter((x) => !x.isYou)] });

  if (!data) {
    return (
      <Screen title="Trip Map" tab="night" back={back}>
        <p className="mt-6 text-center text-[15px] text-label-2">{error ?? "Loading trips…"}</p>
        {error && (
          <div className="mt-6">
            <Button href={back.href} variant="tinted">
              Back to Group
            </Button>
          </div>
        )}
      </Screen>
    );
  }

  const colored = data.trips.map((t, i) => ({ ...t, color: TRIP_COLORS[i % TRIP_COLORS.length], label: t.isYou ? "You" : (t.name ?? "Member") }));
  const mine = data.trips.find((t) => t.isYou) ?? null;
  const destination = data.destination ?? colored.find((t) => t.place)?.place ?? null;
  const arrived = data.trips.filter((t) => t.arrived).length;

  return (
    <Screen title="Trip Map" tab="night" back={back}>
      <p className="-mt-1 mb-3 text-[15px] text-label-2">
        {destination?.name ? `Everyone's way to ${destination.name}` : "Everyone's way there"}
        {data.trips.length > 0 && ` · ${arrived}/${data.trips.length} arrived`}
      </p>

      <TripMap trips={colored} destination={destination} className="h-[380px]" />

      <ListSection header="Who Went How" footer={data.trips.length ? "Thick lines are bus/T, thin lines are walking." : undefined}>
        {colored.length === 0 ? (
          <ListRow title="No trips yet" subtitle="Start yours below. Everyone's path shows up here." />
        ) : (
          colored.map((t) => (
            <ListRow
              key={t.id}
              href={`/trips/${t.id}`}
              icon={<Swatch color={t.color} />}
              iconBg="transparent"
              title={`${t.label} · ${statusText(t)}`}
              subtitle={`${miles(t.distanceM)} · ${duration(t.durationSec)} · ${howText(t)}`}
            />
          ))
        )}
      </ListSection>

      {(!mine || mine.status === "recording") && <TripRecorderCard roomId={data.roomId} current={mine} onChange={upsert} />}
      {error && <p className="mt-2 text-center text-[13px] text-label-2">{error}</p>}
    </Screen>
  );
}
