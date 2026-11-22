// Owner: P4 - Game Layer & Map (see TEAM.md)
"use client";

import { useCallback, useEffect, useState } from "react";
import type { LatLng } from "@/lib/geo";
import type { VehiclesResult } from "@/lib/mbta/vehicles";
import { ensureUser } from "@/lib/identity";

const TRAIN_POLL_MS = 15_000;

/** Polls live train positions while the tab is visible. Never throws. */
export function useLiveTrains(enabled: boolean): VehiclesResult | null {
  const [data, setData] = useState<VehiclesResult | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/vehicles", { cache: "no-store" });
        const json = (await res.json()) as VehiclesResult;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData((d) => (d ? { ...d, source: "stale" } : { vehicles: [], source: "unavailable", fetchedAt: null }));
      }
    };
    load();
    const id = setInterval(load, TRAIN_POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, [enabled]);

  return enabled ? data : null;
}

/** Station ids this user has stamped (empty until check-ins exist). */
export function useStampedStations(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureUser();
        const res = await fetch("/api/me/stamps");
        if (!res.ok) return;
        const { stamps } = (await res.json()) as { stamps: { stationId: string }[] };
        if (!cancelled) setIds(new Set(stamps.map((s) => s.stationId)));
      } catch {
        // offline: show everything as unexplored
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return ids;
}

/**
 * "You are here", kept up to date while the page is open and visible (asks for location on
 * first use). Location stays on the device; it isn't sent to the server.
 */
export function useWatchedLocation(enabled = true) {
  const [me, setMe] = useState<(LatLng & { accuracyM: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      // reported from a callback, like the other errors, not set during the effect itself
      const id = setTimeout(() => setError("Location isn't available on this device"), 0);
      return () => clearTimeout(id);
    }
    let watchId: number | null = null;
    const start = () => {
      if (watchId != null || document.visibilityState !== "visible") return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy });
          setError(null);
        },
        (err) => setError(err.code === err.PERMISSION_DENIED ? "Location permission denied" : "Couldn't get your location"),
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
      );
    };
    const stop = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };
    // GPS is off while the app is hidden (saves battery), back on when it's shown again.
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return { me: enabled ? me : null, error: enabled ? error : null };
}

/** One-shot "locate me". Location stays on the device; it isn't sent to the server. */
export function useMyLocation() {
  const [me, setMe] = useState<(LatLng & { accuracyM: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("Location isn't available on this device");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy });
        setLocating(false);
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED ? "Location permission denied" : "Couldn't get your location");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  return { me, error, locating, locate };
}
