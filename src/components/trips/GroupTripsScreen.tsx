// Owner: P4 - Game Layer & Map (see TEAM.md)
// /room/BHSG/trips: everyone's path to the restaurant on one map, Strava-style. Refreshes
// every 10 s while someone is still on the way.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ListRow, ListSection, Screen, SelectRow } from "@/components/shared/ios";
import SnapReceiptButton from "@/components/rewards/SnapReceiptButton";
import type { SquadPlan } from "@/features/ml";
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

type Pick = { id: string; name: string };

/**
 * After your trip: pick where the group ate, then snap the receipt. Claiming one of the group's
 * picks is a group visit: each squad-mate who claims the same place raises everyone's bonus.
 */
function ClaimGroupMeal({ picks, ateAt, onAteAt, arrived, placeName }: { picks: Pick[]; ateAt: string; onAteAt: (id: string) => void; arrived: boolean; placeName: string | null }) {
  const options = picks.length ? picks : ateAt ? [{ id: ateAt, name: placeName ?? "Your restaurant" }] : [];
  if (!ateAt) return null;
  return (
    <ListSection
      header={arrived ? "You Made It! Claim Your Points" : "Claim Your Points"}
      footer="Everyone in the group gets points: each of you snaps a receipt for the same place, and every extra person who claims raises the whole group's bonus. Sharing one bill? Each of you can snap the same receipt; set People on it to how many of you it covers."
    >
      {options.length > 1 ? (
        <SelectRow label="We ate at" value={ateAt} options={options.map((p) => ({ value: p.id, label: p.name }))} onChange={onAteAt} />
      ) : (
        <ListRow title="We ate at" value={options[0]?.name ?? "Your restaurant"} />
      )}
      <div className="p-4">
        {/* key: a new place means a fresh button (and a fresh scan) */}
        <SnapReceiptButton key={ateAt} placeId={ateAt} />
      </div>
    </ListSection>
  );
}

/** The group's Top 5 (GET /api/rooms/[code]/plan): where a group trip can go and be claimed. */
function useGroupPicks(code: string): Pick[] {
  const [picks, setPicks] = useState<Pick[]>([]);
  useEffect(() => {
    fetch(`/api/rooms/${encodeURIComponent(code)}/plan`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { plan: SquadPlan | null } | null) =>
        setPicks((body?.plan?.picks ?? []).filter((p) => typeof p.place.lat === "number").map((p) => ({ id: p.place.id, name: p.place.name ?? p.place.id }))),
      )
      .catch(() => setPicks([]));
  }, [code]);
  return picks;
}

export default function GroupTripsScreen({ code }: { code: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = { href: `/room/${code}`, label: "Group" };
  const picks = useGroupPicks(code);
  // Where you're going (before the trip) / where you ate (after). "" = the default below.
  const [goingTo, setGoingTo] = useState("");
  const [ateAt, setAteAt] = useState("");

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
  // Default trip destination: where your group is already heading, else Tonight's pick.
  const heading = goingTo || (destination?.id && picks.some((p) => p.id === destination.id) ? destination.id : picks[0]?.id) || "";

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

      {/* Before starting: pick which of the group's places you're heading to (default: the one
          your group is already going to, else Tonight's pick). */}
      {!mine && picks.length > 1 && (
        <ListSection header="Where Are You Going?" footer="Arriving there ends your trip. Pick the place your group is eating at.">
          <SelectRow
            label="Heading to"
            value={heading}
            options={picks.map((p, i) => ({ value: p.id, label: i === 0 ? `${p.name} (top pick)` : p.name }))}
            onChange={setGoingTo}
          />
        </ListSection>
      )}

      {(!mine || mine.status === "recording") && (
        <TripRecorderCard
          roomId={data.roomId}
          placeId={heading || undefined}
          current={mine}
          onChange={upsert}
        />
      )}

      {/* After "I'm Here": claim points for the meal at the group's place. */}
      {mine && mine.status !== "recording" && (picks.length > 0 || mine.place?.id) && (
        <ClaimGroupMeal
          picks={picks}
          ateAt={ateAt || mine.place?.id || picks[0]?.id || ""}
          onAteAt={setAteAt}
          arrived={mine.arrived}
          placeName={mine.place?.name ?? null}
        />
      )}
      {error && <p className="mt-2 text-center text-[13px] text-label-2">{error}</p>}
    </Screen>
  );
}
