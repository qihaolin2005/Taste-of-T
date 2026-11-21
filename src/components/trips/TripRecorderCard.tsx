// Owner: P4 - Game Layer & Map (see TEAM.md)
// "Start trip" / live recording card. Location is only requested when the user taps Start.
"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ListRow, ListSection } from "@/components/shared/ios";
import type { RideView } from "@/features/rides/service";
import { createTrip, endTrip, recordTrip, type TripRecorder } from "@/features/trips/client";
import type { TripView } from "@/features/trips/service";
import { duration, miles } from "./format";

type Props = {
  /** Group code: your group sees this trip on the group trip map. */
  roomId?: string;
  placeId?: string;
  /** Your current recording trip from the server (e.g. after reopening the app), if any. */
  current: TripView | null;
  onChange: (trip: TripView) => void;
};

function rideText(ride: RideView | null): string | null {
  if (!ride) return null;
  if (ride.status === "verified") return `${ride.routeName ?? "Ride"} verified ✓ (travel points unlocked)`;
  return ride.routeName ? `On ${ride.routeName}? ${ride.message}` : null;
}

export default function TripRecorderCard({ roomId, placeId, current, onChange }: Props) {
  const recorder = useRef<TripRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ride, setRide] = useState<RideView | null>(null);
  // 0 until the clock starts ticking in the browser (no Date.now() during prerender)
  const [now, setNow] = useState(0);

  useEffect(() => () => recorder.current?.stop(), []);
  useEffect(() => {
    if (!recording) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [recording]);

  const live = current?.status === "recording" ? current : null;

  function begin(trip: TripView) {
    recorder.current?.stop();
    setError(null);
    recorder.current = recordTrip(trip.id, {
      onUpdate: (t) => {
        setError(null); // a hiccup (lost GPS, offline) is over once points get through
        onChange(t);
        if (t.status === "finished") setRecording(false);
      },
      onRide: setRide,
      onError: setError,
    });
    setRecording(true);
  }

  async function start() {
    if (!("geolocation" in navigator)) return setError("This browser can't share location.");
    setBusy(true);
    try {
      const trip = await createTrip({ roomId, placeId });
      onChange(trip);
      begin(trip);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!live) return;
    setBusy(true);
    try {
      if (recorder.current) await recorder.current.finish();
      else onChange(await endTrip(live.id));
    } catch (err) {
      setError((err as Error).message);
    }
    recorder.current = null;
    setRecording(false);
    setBusy(false);
  }

  if (!live) {
    return (
      <ListSection
        header="Record Your Trip"
        footer={
          roomId
            ? "Records your path until you get there, like Strava. Your group sees everyone's paths here. The first 200 m near where you start stays hidden from them."
            : "Records your path until you get there, like Strava. Only you can see solo trips."
        }
      >
        <div className="p-4">
          <Button onClick={start} disabled={busy}>
            {busy ? "Starting…" : "Start Trip"}
          </Button>
          {error && <p className="mt-2 text-center text-[13px] text-[#ff3b30]">{error}</p>}
        </div>
      </ListSection>
    );
  }

  const elapsed = Math.max(0, Math.round((now - new Date(live.startedAt).getTime()) / 1000));
  return (
    <ListSection
      header={recording ? "● Recording" : "Trip in Progress"}
      footer="Keep the app open on the way. iPhone web apps can't track location in the background, so the screen stays on while recording."
    >
      <ListRow title="Time" value={duration(recording && now ? elapsed : live.durationSec)} />
      <ListRow title="Distance" value={miles(live.distanceM)} />
      {live.place && <ListRow title="Heading to" value={live.place.name ?? "Restaurant"} />}
      {rideText(ride) && <ListRow title={rideText(ride)} />}
      <div className="flex flex-col gap-2 p-4">
        {recording ? (
          <Button onClick={finish} disabled={busy}>
            {busy ? "Saving…" : "I'm Here: End Trip"}
          </Button>
        ) : (
          <>
            <Button onClick={() => begin(live)}>Resume Recording</Button>
            <Button variant="tinted" onClick={finish} disabled={busy}>
              End Trip
            </Button>
          </>
        )}
        {error && <p className="text-center text-[13px] text-[#ff3b30]">{error}</p>}
      </div>
    </ListSection>
  );
}
