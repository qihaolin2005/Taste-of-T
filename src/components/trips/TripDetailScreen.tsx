// Owner: P4 - Game Layer & Map (see TEAM.md)
// /trips/:id: one trip on the map, with its stats. For a group trip, step through everyone's
// trips in that group one by one (previous / next), live or after the group ended.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListRow, ListSection, Screen } from "@/components/shared/ios";
import Link from "next/link";
import { fetchRoomTrips, fetchTrip, removeTrip } from "@/features/trips/client";
import type { TripView } from "@/features/trips/service";
import { howText, statusText, whenText } from "./format";
import TripMap, { TRIP_COLORS } from "./TripMap";
import TripStats from "./TripStats";

/** "‹ Maya's trip" / "Leo's trip ›": the neighbor in the group's list, or an empty slot. */
function StepLink({ trip, label, dir }: { trip: { id: string } | null; label: string | null; dir: "prev" | "next" }) {
  const cls = `flex min-h-[40px] min-w-0 flex-1 items-center gap-1 rounded-full px-3 text-[14px] font-semibold ${dir === "next" ? "justify-end" : ""}`;
  if (!trip || !label) return <span className={cls} />;
  return (
    <Link href={`/trips/${trip.id}`} replace className={`${cls} bg-lavender text-plum active:opacity-70`}>
      {dir === "prev" && <span aria-hidden>‹</span>}
      <span className="truncate">{label}</span>
      {dir === "next" && <span aria-hidden>›</span>}
    </Link>
  );
}

export default function TripDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const [trip, setTrip] = useState<TripView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The group you're in now (null = none). A trip from a group that has ended goes back to My
  // A group trip: everyone's trips in the group (same order and colors as the group map), so
  // you can step through them one by one. Works for live and ended groups.
  const [group, setGroup] = useState<Awaited<ReturnType<typeof fetchRoomTrips>> | null>(null);

  useEffect(() => {
    fetchTrip(id).then(setTrip, (e: Error) => setError(e.message));
  }, [id]);
  const roomId = trip?.roomId ?? null;
  useEffect(() => {
    if (!roomId) return;
    fetchRoomTrips(roomId).then(setGroup, () => setGroup(null)); // not viewable: just this trip
  }, [roomId]);

  const back = roomId ? { href: `/room/${roomId}/trips`, label: group?.ended ? "Group Trip" : "Group" } : { href: "/trips", label: "Trips" };
  const order = group && roomId === group.roomId ? group.trips : [];
  const index = order.findIndex((t) => t.id === id);
  const prev = index > 0 ? order[index - 1] : null;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : null;
  const who = (t: { isYou: boolean; name: string | null }) => (t.isYou ? "Your trip" : `${t.name ?? "Member"}'s trip`);
  const color = index >= 0 ? TRIP_COLORS[index % TRIP_COLORS.length] : TRIP_COLORS[0];

  if (!trip) {
    return (
      <Screen title="Trip" tab="profile" back={back}>
        <p className="mt-6 text-center text-[15px] text-label-2">{error ?? "Loading trip…"}</p>
      </Screen>
    );
  }

  async function del() {
    if (!confirm("Delete this trip? Your path will be removed for everyone.")) return;
    setDeleting(true);
    try {
      await removeTrip(trip!.id);
      router.push("/trips");
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <Screen
      title={trip.isYou ? (trip.place?.name ?? "Your trip") : `${trip.name ?? "Their"}'s trip`}
      tab={roomId && group && !group.ended ? "night" : "profile"}
      back={back}
    >
      <p className="-mt-1 mb-3 text-[15px] text-label-2">
        {!trip.isYou && trip.place?.name && `To ${trip.place.name} · `}
        {whenText(trip.startedAt)} · {statusText(trip)}
      </p>

      {/* One by one through the group: previous / next person's trip. */}
      {order.length > 1 && index >= 0 && (
        <nav className="mb-3 flex items-center gap-2" aria-label="Group trips">
          <StepLink trip={prev} label={prev ? who(prev) : null} dir="prev" />
          <span className="shrink-0 px-1 text-[13px] text-label-2">
            {index + 1} of {order.length}
          </span>
          <StepLink trip={next} label={next ? who(next) : null} dir="next" />
        </nav>
      )}

      <TripMap trips={[{ ...trip, color, label: trip.isYou ? "You" : (trip.name ?? "Member") }]} destination={trip.place} className="h-[360px]" />
      <TripStats trip={trip} />

      <ListSection header="How" footer={trip.startHidden ? "The start of this path is hidden for privacy." : undefined}>
        <ListRow title={howText(trip)} subtitle={trip.rides.length ? "Verified with live MBTA data" : undefined} />
      </ListSection>

      {trip.isYou && (
        <ListSection>
          <ListRow title={deleting ? "Deleting…" : "Delete Trip"} destructive onClick={deleting ? undefined : del} />
        </ListSection>
      )}
      {error && <p className="mt-2 text-center text-[13px] text-[#ff3b30]">{error}</p>}
    </Screen>
  );
}
