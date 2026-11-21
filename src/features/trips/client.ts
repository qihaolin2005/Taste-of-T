// Owner: P2 - Data & Integrations (see TEAM.md)
// Phone side of trip recording (browser only).
//
//   const trip = await createTrip({ roomId: "BHSG" });            // after the user taps "Start trip"
//   const rec = recordTrip(trip.id, { onUpdate: setTrip });
//   ...await rec.finish();                                        // "I'm here" (or arriving finishes it)
//
// - Asks for location (the browser prompt) when recording starts.
// - Sends the path every 15 s. While you're moving at bus/train speed it also pings
//   /api/rides/ping, so bus/T legs get verified for travel points along the way.
// - Keeps the screen awake: iPhone web apps can't track location in the background, so the
//   app has to stay open (the phone can sit in your pocket with the screen on).
import type { RideView } from "@/features/rides/service";
import type { TripView } from "./service";

const FLUSH_MS = 15_000;
const RIDE_PING_MS = 30_000;
/** ~18 km/h: faster than walking or jogging, so probably on a bus or train. */
const VEHICLE_SPEED_MPS = 5;

type Fix = { lat: number; lng: number; t: number; accuracyM?: number };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  return body as T;
}

export const createTrip = (input: { roomId?: string; placeId?: string } = {}) => call<TripView>("/api/trips", { method: "POST", body: JSON.stringify(input) });
export const fetchMyTrips = () => call<{ trips: TripView[] }>("/api/trips").then((r) => r.trips);
export const fetchTrip = (id: string) => call<TripView>(`/api/trips/${encodeURIComponent(id)}`);
export const fetchRoomTrips = (code: string) =>
  call<{ roomId: string; trips: TripView[]; destination: TripView["place"] }>(`/api/rooms/${encodeURIComponent(code)}/trips`);
export const endTrip = (id: string) => call<TripView>(`/api/trips/${encodeURIComponent(id)}/finish`, { method: "POST" });
export const removeTrip = (id: string) => call<null>(`/api/trips/${encodeURIComponent(id)}`, { method: "DELETE" });

type Options = {
  onUpdate: (trip: TripView) => void;
  onRide?: (ride: RideView) => void;
  onError?: (message: string) => void;
};

export type TripRecorder = { finish: () => Promise<TripView | null>; stop: () => void };

function metersBetween(a: Fix, b: Fix) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function recordTrip(tripId: string, { onUpdate, onRide, onError }: Options): TripRecorder {
  const base = `/api/trips/${encodeURIComponent(tripId)}`;
  let buffer: Fix[] = [];
  let sending: Promise<void> | null = null;
  let stopped = false;
  let prev: Fix | null = null;
  let lastRidePing = 0;
  let rideId: string | undefined;
  let wakeLock: { release: () => Promise<void> } | null = null;

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

  const pingRide = async (fix: Fix) => {
    lastRidePing = fix.t;
    try {
      const ride = await call<RideView>("/api/rides/ping", {
        method: "POST",
        body: JSON.stringify({ lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM, ...(rideId ? { rideId } : {}) }),
      });
      // once a ride is verified, the next fast stretch (a transfer) starts a new ride
      rideId = ride.status === "verified" ? undefined : ride.id;
      onRide?.(ride);
    } catch {
      // ride checks are a bonus; the path is still recorded
    }
  };

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (stopped) return;
      const fix: Fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Math.round(pos.timestamp), accuracyM: pos.coords.accuracy };
      const speed = pos.coords.speed ?? (prev && fix.t > prev.t ? metersBetween(prev, fix) / ((fix.t - prev.t) / 1000) : 0);
      prev = fix;
      buffer.push(fix);
      if (buffer.length === 1 && !sending) void flush(); // first fix shows up right away
      if (speed >= VEHICLE_SPEED_MPS && fix.t - lastRidePing >= RIDE_PING_MS) void pingRide(fix);
    },
    (err) => onError?.(err.code === err.PERMISSION_DENIED ? "Allow location to record your trip (Settings > Safari > Location)." : "Can't get your location right now."),
    { enableHighAccuracy: true, maximumAge: 3_000 },
  );
  const timer = setInterval(() => void flush(), FLUSH_MS);

  function stop() {
    if (stopped) return;
    stopped = true;
    navigator.geolocation.clearWatch(watchId);
    clearInterval(timer);
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
