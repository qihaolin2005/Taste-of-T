// Owner: P4 - Game Layer & Map (see TEAM.md)
// /room/BHSG/trips: everyone's path to the restaurant on one map, Strava-style. Refreshes
// every 10 s while someone is still on the way.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ListRow, ListSection, Screen, SelectRow } from "@/components/shared/ios";
import SnapReceiptButton from "@/components/rewards/SnapReceiptButton";
import { useWatchedLocation } from "@/components/game/map/hooks";
import type { SquadPlan } from "@/features/ml";
import { fetchRoomTrips } from "@/features/trips/client";
import type { TripView } from "@/features/trips/service";
import { dayText, duration, howText, miles, statusText } from "./format";
import TripMap, { TRIP_COLORS } from "./TripMap";
import TripRecorderCard from "./TripRecorderCard";
import { placeChosen } from "./tripMapAccess";

const POLL_MS = 10_000;

type Data = Awaited<ReturnType<typeof fetchRoomTrips>>;

function Swatch({ color }: { color: string }) {
  return <span className="block size-[14px] shrink-0 rounded-full border-2 border-white shadow" style={{ background: color }} />;
}

type Pick = { id: string; name: string; lat?: number; lng?: number };

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
function useGroupPicks(code: string): Pick[] | null {
  const [picks, setPicks] = useState<Pick[] | null>(null); // null = still loading
  useEffect(() => {
    fetch(`/api/rooms/${encodeURIComponent(code)}/plan`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { plan: SquadPlan | null } | null) =>
        setPicks(
          (body?.plan?.picks ?? [])
            .filter((p) => typeof p.place.lat === "number" && typeof p.place.lng === "number")
            .map((p) => ({ id: p.place.id, name: p.place.name ?? p.place.id, lat: p.place.lat!, lng: p.place.lng! })),
        ),
      )
      .catch(() => setPicks([]));
  }, [code]);
  return picks;
}

export default function GroupTripsScreen({ code }: { code: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An ended group: a read-only record of how everyone got there (opened from My Trips).
  const ended = data?.ended ?? false;
  const back = ended ? { href: "/trips", label: "My Trips" } : { href: `/room/${code}`, label: "Group" };
  const loadedPicks = useGroupPicks(code);
  const picks = loadedPicks ?? [];
  // Your blue dot: the phone's position now, even before you start a trip (stays on the device).
  // Not on a past group trip.
  const { me, error: locError } = useWatchedLocation(!!data && !ended);
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

  // Locked until the group has a place to eat (opened from an old link, or before swiping ends).
  if (!ended && loadedPicks && !placeChosen({ picks: loadedPicks }, data.destination)) {
    return (
      <Screen title="Trip Map" tab="night" back={back}>
        <div className="mt-3 rounded-[10px] bg-cell px-4 py-10 text-center">
          <p className="text-[17px] font-semibold">Pick a place to eat first</p>
          <p className="mt-1 text-[15px] text-label-2">The Trip Map opens once your group has chosen where to eat. Finish swiping in your group to pick one.</p>
        </div>
        <div className="mt-6">
          <Button href={back.href} variant="tinted">
            Back to Group
          </Button>
        </div>
      </Screen>
    );
  }

  const colored = data.trips.map((t, i) => ({ ...t, color: TRIP_COLORS[i % TRIP_COLORS.length], label: t.isYou ? "You" : (t.name ?? "Member") }));
  const mine = data.trips.find((t) => t.isYou) ?? null;
  // Your trip gets its own button; the list is everyone else (colors match the map).
  const yours = colored.find((t) => t.isYou) ?? null;
  const others = colored.filter((t) => !t.isYou);
  const tripsPlace = data.destination ?? colored.find((t) => t.place)?.place ?? null;
  const arrived = data.trips.filter((t) => t.arrived).length;
  // Default trip destination: where your group is already heading, else Tonight's pick.
  const heading = goingTo || (tripsPlace?.id && picks.some((p) => p.id === tripsPlace.id) ? tripsPlace.id : picks[0]?.id) || "";
  // The restaurant pin: where the trips are heading, else the pick you're heading to (so it shows
  // before anyone starts, and when a trip was started without a place).
  const headingPick = picks.find((p) => p.id === heading);
  const destination =
    tripsPlace ?? (headingPick?.lat != null && headingPick.lng != null ? { id: headingPick.id, name: headingPick.name, lat: headingPick.lat, lng: headingPick.lng } : null);

  return (
    <Screen title={ended ? data.name : "Trip Map"} tab={ended ? "profile" : "night"} back={back}>
      <p className="-mt-1 mb-3 text-[15px] text-label-2">
        {ended && `${dayText(data.date)} · `}
        {destination?.name ? `Everyone's way to ${destination.name}` : "Everyone's way there"}
        {data.trips.length > 0 && ` · ${arrived}/${data.trips.length} arrived`}
      </p>

      <TripMap trips={colored} destination={destination} me={me} className="h-[380px]" />
      {locError && <p className="mt-2 px-1 text-[13px] text-label-2">Your blue dot: {locError.toLowerCase()}. Turn on location for this site to see where you are.</p>}

      {/* The group first (the map above); your own trip is one tap away. */}
      {yours && (
        <div className="mt-4">
          <Button href={`/trips/${yours.id}`} variant="tinted">
            <Swatch color={yours.color} /> View Your Trip
            <span className="font-medium opacity-70">
              · {miles(yours.distanceM)} · {statusText(yours)}
            </span>
          </Button>
        </div>
      )}

      <ListSection
        header={yours ? "Everyone Else" : "Who Went How"}
        footer={data.trips.length ? "Thick lines are bus/T, thin lines are walking. Tap someone to see their trip, then step through everyone's." : undefined}
      >
        {others.length === 0 ? (
          <ListRow
            title={yours ? "Nobody else yet" : "No trips yet"}
            subtitle={ended ? "Nobody else recorded a trip." : yours ? "Their paths show up here once they start." : "Start yours below. Everyone's path shows up here."}
          />
        ) : (
          others.map((t) => (
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
      {/* A past group trip is read-only: no starting trips or claiming meals. */}
      {!ended && !mine && picks.length > 1 && (
        <ListSection header="Where Are You Going?" footer="Arriving there ends your trip. Pick the place your group is eating at.">
          <SelectRow
            label="Heading to"
            value={heading}
            options={picks.map((p, i) => ({ value: p.id, label: i === 0 ? `${p.name} (top pick)` : p.name }))}
            onChange={setGoingTo}
          />
        </ListSection>
      )}

      {!ended && (!mine || mine.status === "recording") && (
        <TripRecorderCard
          roomId={data.roomId}
          placeId={heading || undefined}
          current={mine}
          onChange={upsert}
        />
      )}

      {/* After "I'm Here": claim points for the meal at the group's place. */}
      {!ended && mine && mine.status !== "recording" && (picks.length > 0 || mine.place?.id) && (
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
