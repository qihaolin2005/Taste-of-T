// Owner: P4 - Game Layer & Map (see TEAM.md)
// Browser-side helpers for the current user. Identity lives in an httpOnly session cookie
// set by the server (POST /api/me), not localStorage, so API routes can trust it.
//
//   await ensureUser();                       // once on app start
//   const me = await getMe();                 // { user, preferences, location }
//   await savePreferences({ tastes: ["dumplings"] });
//   await shareCurrentLocation();             // asks for GPS permission
import type { Preferences, PublicUser, StoredLocation } from "@/features/users";

export type Me = { user: PublicUser; preferences: Preferences; location: StoredLocation | null };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  return body as T;
}

export const ensureUser = () => call<{ user: PublicUser; created: boolean }>("/api/me", { method: "POST" });
export const getMe = () => call<Me>("/api/me");
export const updateProfile = (patch: { displayName?: string; avatar?: string | null }) =>
  call<{ user: PublicUser }>("/api/me", { method: "PATCH", body: JSON.stringify(patch) });
export const deleteAccount = () => call<void>("/api/me", { method: "DELETE" });

export const savePreferences = (patch: Partial<Omit<Preferences, "updatedAt">>) =>
  call<{ preferences: Preferences }>("/api/me/preferences", { method: "PATCH", body: JSON.stringify(patch) });

export const forgetLocation = () => call<void>("/api/me/location", { method: "DELETE" });

/** Read GPS (prompts the user), turn on sharing, and store it. Needs HTTPS on iPhone. */
export async function shareCurrentLocation(): Promise<StoredLocation> {
  const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10_000 }),
  );
  await savePreferences({ shareLocation: true });
  const { location } = await call<{ location: StoredLocation }>("/api/me/location", {
    method: "PUT",
    body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
  });
  return location;
}
