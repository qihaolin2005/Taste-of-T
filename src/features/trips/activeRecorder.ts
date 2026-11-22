// Owner: P4 - Game Layer & Map (see TEAM.md)
// The one trip recorder for the whole app (browser only).
//
// It lives here, not inside a component, because Next keeps pages you've left alive in the
// background and runs their effect cleanups: a recorder owned by TripRecorderCard was stopped the
// moment you opened another tab (say, Claim Points) while the card still said "● Recording". Now
// leaving the page never stops it; only finishing the trip (or arriving) does. Every
// TripRecorderCard (My Trips, a group's Trip Map, a Spin quest) shows this same recorder.
"use client";

import type { RideView } from "@/features/rides/service";
import type { TripView } from "./service";
import { recordTrip, type TripRecorder } from "./client";

export type RecorderEvents = {
  onUpdate?: (trip: TripView) => void;
  onRide?: (ride: RideView) => void;
  onError?: (message: string) => void;
};

let active: { tripId: string; recorder: TripRecorder } | null = null;
const eventListeners = new Set<RecorderEvents>();
const stateListeners = new Set<() => void>();
const changed = () => stateListeners.forEach((l) => l());

/** Id of the trip being recorded right now, or null. */
export const recordingTripId = (): string | null => active?.tripId ?? null;

/** For useSyncExternalStore: re-render when recording starts or stops. */
export function subscribeRecording(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** Hear every update, ride check and error from the recorder, while mounted. */
export function listenToRecorder(events: RecorderEvents): () => void {
  eventListeners.add(events);
  return () => eventListeners.delete(events);
}

/** Start (or restart) recording `trip`. Any other recording stops first. */
export function startRecording(trip: TripView): void {
  active?.recorder.stop();
  const tripId = trip.id;
  active = {
    tripId,
    recorder: recordTrip(tripId, {
      onUpdate: (t) => {
        eventListeners.forEach((l) => l.onUpdate?.(t));
        // Arrived (or ended elsewhere): the recorder has stopped itself.
        if (t.status === "finished" && active?.tripId === tripId) {
          active = null;
          changed();
        }
      },
      onRide: (r) => eventListeners.forEach((l) => l.onRide?.(r)),
      onError: (m) => eventListeners.forEach((l) => l.onError?.(m)),
    }),
  };
  changed();
}

/** Send what's left and end the trip. Returns the finished trip, or null if nothing was recording. */
export async function finishRecording(): Promise<TripView | null> {
  const a = active;
  active = null;
  changed();
  return a ? a.recorder.finish() : null;
}
