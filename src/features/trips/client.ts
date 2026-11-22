// Owner: P2 - Data & Integrations (see TEAM.md)
// Phone side of trip recording (browser only).
//
//   const trip = await createTrip({ roomId: "BHSG" });            // after the user taps "Start trip"
//   const rec = recordTrip(trip.id, { onUpdate: setTrip });
//   ...await rec.finish();                                        // "I'm here" (or arriving finishes it)
//
// - Asks for location (the browser prompt) when recording starts.
// - Sends the path every 15 s, and a ride ping (/api/rides/ping) every 30 s. The server checks
//   each ping against live MBTA vehicles, so bus/T legs get verified (and named: "Bus 41",
//   "Red Line") along the way. No speed gate on the phone: city buses often move at walking
//   pace, and only matching the same live vehicle again and again tells a slow bus from a walk.
// - Keeps the screen awake: iPhone web apps can't track location in the background, so the
//   app has to stay open (the phone can sit in your pocket with the screen on).
import type { RideView } from "@/features/rides/service";
import type { GroupTrips, GroupTripSummary, TripView } from "./service";

const FLUSH_MS = 15_000;
const RIDE_PING_MS = 30_000;
/** A verified ride ends (you got off) after this many pings in a row off its vehicle. */
const OFF_VEHICLE_PINGS = 2;

type Fix = { lat: number; lng: number; t: number; accuracyM?: number };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  return body as T;
}

export const createTrip = (input: { roomId?: string; placeId?: string; questId?: string } = {}) => call<TripView>("/api/trips", { method: "POST", body: JSON.stringify(input) });
export const fetchMyTrips = () => call<{ trips: TripView[] }>("/api/trips").then((r) => r.trips);
export const fetchTrip = (id: string) => call<TripView>(`/api/trips/${encodeURIComponent(id)}`);
export const fetchRoomTrips = (code: string) => call<GroupTrips>(`/api/rooms/${encodeURIComponent(code)}/trips`);
export const fetchMyGroupTrips = () => call<{ groups: GroupTripSummary[] }>("/api/trips/groups").then((r) => r.groups);
export const endTrip = (id: string) => call<TripView>(`/api/trips/${encodeURIComponent(id)}/finish`, { method: "POST" });
export const removeTrip = (id: string) => call<null>(`/api/trips/${encodeURIComponent(id)}`, { method: "DELETE" });

type Options = {
  onUpdate: (trip: TripView) => void;
  onRide?: (ride: RideView) => void;
  onError?: (message: string) => void;
};

export type TripRecorder = { finish: () => Promise<TripView | null>; stop: () => void };

export function recordTrip(tripId: string, { onUpdate, onRide, onError }: Options): TripRecorder {
  const base = `/api/trips/${encodeURIComponent(tripId)}`;
  let buffer: Fix[] = [];
  let sending: Promise<void> | null = null;
  let stopped = false;
  let latest: Fix | null = null;
  let lastRidePing = 0;
  let rideId: string | undefined;
  let offVehicle = 0;
  let wakeLock: { release: () => Promise<void> } | null = null;
  let sentFirst = false;

  const keepAwake = async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      if (!stopped && document.visibilityState === "visible") wakeLock = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      // not supported / denied: recording still works while the screen is on
    }
  };
  void keepAwake();
  // the wake lock is dropped when the app is hidden; take it again when it comes back
  const onVisible = () => void keepAwake();
  document.addEventListener("visibilitychange", onVisible);

  const flush = async () => {
    if (sending) return sending;
    if (!buffer.length || stopped) return;
    const batch = buffer.slice(0, 200);
    sending = (async () => {
      try {
        const trip = await call<TripView>(`${base}/points`, { method: "POST", body: JSON.stringify({ points: batch }) });
        buffer = buffer.slice(batch.length);
        onUpdate(trip);
        if (trip.status === "finished") stop();
      } catch (err) {
        const msg = (err as Error).message;
        if (/already ended/i.test(msg)) stop();
        onError?.(/fetch|network/i.test(msg) ? "No connection. Keep the app open and your path will sync when you are back online." : msg);
      } finally {
        sending = null;
      }
    })();
    return sending;
  };

  const pingRide = async () => {
    const fix = latest;
    // Only recent fixes. Phones report less often when not moving (bus at a light), so allow a
    // minute; a fix older than that would be compared with where vehicles are now.
    if (stopped || !fix || Date.now() - fix.t > 60_000) return;
    lastRidePing = Date.now();
    try {
      const ride = await call<RideView>("/api/rides/ping", {
        method: "POST",
        body: JSON.stringify({ lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM, ...(rideId ? { rideId } : {}) }),
      });
      if (ride.status === "verified" && !ride.onVehicle) {
        // off the vehicle twice in a row: you got off. The next vehicle (a transfer) is a new ride.
        if (++offVehicle >= OFF_VEHICLE_PINGS) {
          rideId = undefined;
          offVehicle = 0;
        }
      } else {
        offVehicle = 0;
        rideId = ride.id ?? undefined;
      }
      onRide?.(ride);
    } catch {
      // ride checks are a bonus; the path is still recorded
    }
  };

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (stopped) return;
      const fix: Fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Math.round(pos.timestamp), accuracyM: pos.coords.accuracy };
      latest = fix;
      buffer.push(fix);
      // Only the trip's very first fix is sent right away (so the path shows up); the rest go in
      // FLUSH_MS batches. Sending whenever the buffer was empty meant one request per GPS fix
      // (about one a second while moving), which ran into the points route's rate limit (429).
      if (!sentFirst && !sending) {
        sentFirst = true;
        void flush();
      }
      if (Date.now() - lastRidePing >= RIDE_PING_MS) void pingRide();
    },
    (err) => onError?.(err.code === err.PERMISSION_DENIED ? "Allow location to record your trip (Settings > Safari > Location)." : "Can't get your location right now."),
    { enableHighAccuracy: true, maximumAge: 3_000 },
  );
  const timer = setInterval(() => void flush(), FLUSH_MS);
  // also ping when the phone reports no new position (e.g. the bus is stopped at a light)
  const rideTimer = setInterval(() => {
    if (Date.now() - lastRidePing >= RIDE_PING_MS) void pingRide();
  }, 5_000);

  function stop() {
    if (stopped) return;
    stopped = true;
    navigator.geolocation.clearWatch(watchId);
    clearInterval(timer);
    clearInterval(rideTimer);
    document.removeEventListener("visibilitychange", onVisible);
    void wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  async function finish(): Promise<TripView | null> {
    await sending;
    await flush();
    stop();
    try {
      const trip = await call<TripView>(`${base}/finish`, { method: "POST" });
      onUpdate(trip);
      return trip;
    } catch (err) {
      onError?.((err as Error).message);
      return null;
    }
  }

  return { finish, stop };
}
