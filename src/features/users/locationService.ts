// Owner: P2 - Data & Integrations (see TEAM.md)
// Last-known location, opt-in only. Used to suggest a starting station.
// Privacy rules:
//  - Stored only when preferences.shareLocation is true (else the write is refused).
//  - One row per user, overwritten: no movement history.
//  - Coordinates are rounded to ~11 m (4 decimals), enough to pick a station.
//  - Turning sharing off or deleting the account removes it.
import { nearestStation, type StationPoint } from "@/lib/geo";
import type { LocationUpdate } from "./schemas";
import type { Db } from "./userService";

export type StoredLocation = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  nearestStationId: string | null;
  recordedAt: string;
};

export class LocationSharingDisabledError extends Error {
  constructor() {
    super("Location sharing is off. Enable shareLocation in preferences first.");
  }
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export async function recordLocation(
  db: Db,
  userId: string,
  loc: LocationUpdate,
  stations: readonly StationPoint[],
): Promise<StoredLocation> {
  const prefs = await db.userPreferences.findUnique({ where: { userId }, select: { shareLocation: true } });
  if (!prefs?.shareLocation) throw new LocationSharingDisabledError();

  const data = {
    lat: round4(loc.lat),
    lng: round4(loc.lng),
    accuracyM: loc.accuracyM ?? null,
    nearestStationId: nearestStation(loc, stations)?.station.id ?? null,
    recordedAt: new Date(),
  };
  const row = await db.userLocation.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return toStored(row);
}

export async function getLocation(db: Db, userId: string): Promise<StoredLocation | null> {
  const row = await db.userLocation.findUnique({ where: { userId } });
  return row ? toStored(row) : null;
}

export async function clearLocation(db: Db, userId: string): Promise<void> {
  await db.userLocation.deleteMany({ where: { userId } });
}

function toStored(r: { lat: number; lng: number; accuracyM: number | null; nearestStationId: string | null; recordedAt: Date }): StoredLocation {
  return { lat: r.lat, lng: r.lng, accuracyM: r.accuracyM, nearestStationId: r.nearestStationId, recordedAt: r.recordedAt.toISOString() };
}
