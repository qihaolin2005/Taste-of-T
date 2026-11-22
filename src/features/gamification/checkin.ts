// Owner: P4 - Game Layer & Map (see TEAM.md)
// GPS check-in: is the phone actually at a place? Pure (no DB, no Next), so any feature can use it.
// Used by reward claims (src/features/rewards/proof.ts): you claim points while at the restaurant.
//
// A phone reports its position plus an accuracy radius in meters (68% confidence). Indoors that
// is often 20-80 m, so we allow some of the reported error on top of the radius, but not so much
// that a very rough fix (a cell tower, hundreds of meters) counts as being there.
import { distanceMeters, type LatLng } from "@/lib/geo";

export type CheckInConfig = {
  /** How close to the place counts as "there". Restaurants can be big, and pins sit mid-building. */
  radiusM: number;
  /** At most this much of the phone's reported accuracy is added to the radius. */
  maxSlackM: number;
  /** A fix rougher than this can't prove anything; the user should try again. */
  maxAccuracyM: number;
};

export const CHECKIN_CONFIG: CheckInConfig = { radiusM: 150, maxSlackM: 75, maxAccuracyM: 500 };

export type Here = LatLng & { accuracyM?: number };

export type CheckInResult =
  | { ok: true; distanceM: number }
  | { ok: false; reason: "too_far" | "too_rough"; distanceM: number; allowedM: number; message: string };

/** Checks that `here` (the phone's GPS fix) is at `place`. */
export function checkIn(here: Here, place: LatLng, cfg: CheckInConfig = CHECKIN_CONFIG): CheckInResult {
  const distanceM = Math.round(distanceMeters(here, place));
  const accuracy = here.accuracyM ?? 0;
  const allowedM = cfg.radiusM + Math.min(accuracy, cfg.maxSlackM);
  if (accuracy > cfg.maxAccuracyM) {
    return { ok: false, reason: "too_rough", distanceM, allowedM, message: "Your location is too rough to check you in. Turn on precise location and try again." };
  }
  if (distanceM > allowedM) {
    const away = distanceM >= 1000 ? `${(distanceM / 1609).toFixed(1)} mi` : `${distanceM} m`;
    return { ok: false, reason: "too_far", distanceM, allowedM, message: `You need to be at the restaurant to claim. You're about ${away} away.` };
  }
  return { ok: true, distanceM };
}
