// Owner: P2 - Data & Integrations (see TEAM.md)
// Phone side of ride verification. Start it when the user taps "I'm on the bus/T":
//
//   const tracker = startRideTracking({ onUpdate: (ride) => setRide(ride) });
//   ...later: tracker.stop();          // stops automatically once verified
//
// Sends the phone's position every 30 s. Needs location permission (and HTTPS on iPhone).
// The app must stay open: iOS web apps can't track location in the background.
import type { RideView } from "./service";

type Options = {
  onUpdate: (ride: RideView) => void;
  onError?: (message: string) => void;
  intervalMs?: number;
};

export function startRideTracking({ onUpdate, onError, intervalMs = 30_000 }: Options): { stop: () => void } {
  let rideId: string | undefined;
  let stopped = false;
  let lastSent = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let latest: GeolocationPosition | null = null;

  const send = async () => {
    if (stopped || !latest) return;
    lastSent = Date.now();
    const { latitude: lat, longitude: lng, accuracy } = latest.coords;
    try {
      const res = await fetch("/api/rides/ping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat, lng, accuracyM: accuracy, ...(rideId ? { rideId } : {}) }),
      });
      const body = await res.json();
      if (!res.ok) return onError?.(body?.error?.message ?? "Ride check failed");
      const ride = body as RideView;
      rideId = ride.id;
      onUpdate(ride);
      if (ride.status === "verified") stop();
    } catch {
      onError?.("No connection. We'll keep trying.");
    }
  };

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      latest = pos;
      if (Date.now() - lastSent >= intervalMs) void send(); // first fix goes out immediately
    },
    (err) => onError?.(err.code === err.PERMISSION_DENIED ? "Location permission is needed to verify your ride." : "Can't get your location."),
    { enableHighAccuracy: true, maximumAge: 5_000 },
  );
  timer = setInterval(() => void send(), intervalMs);

  function stop() {
    stopped = true;
    navigator.geolocation.clearWatch(watchId);
    if (timer) clearInterval(timer);
    timer = undefined;
  }
  return { stop };
}
