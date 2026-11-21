// Owner: P4 - Game Layer & Map (see TEAM.md)
// /trips/:id: one trip on the map, with its stats.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListRow, ListSection, Screen } from "@/components/shared/ios";
import { fetchTrip, removeTrip } from "@/features/trips/client";
import type { TripView } from "@/features/trips/service";
import { howText, statusText, whenText } from "./format";
import TripMap, { TRIP_COLORS } from "./TripMap";
import TripStats from "./TripStats";

export default function TripDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const [trip, setTrip] = useState<TripView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchTrip(id).then(setTrip, (e: Error) => setError(e.message));
  }, [id]);

  const back = trip?.roomId ? { href: `/room/${trip.roomId}/trips`, label: "Group" } : { href: "/trips", label: "Trips" };

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
    <Screen title={trip.isYou ? (trip.place?.name ?? "Your trip") : `${trip.name ?? "Their"}'s trip`} tab={trip.roomId ? "night" : "profile"} back={back}>
      <p className="-mt-1 mb-3 text-[15px] text-label-2">
        {!trip.isYou && trip.place?.name && `To ${trip.place.name} · `}
        {whenText(trip.startedAt)} · {statusText(trip)}
      </p>
      <TripMap trips={[{ ...trip, color: TRIP_COLORS[0], label: trip.name ?? "You" }]} destination={trip.place} className="h-[360px]" />
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
