// Owner: P4 - Game Layer & Map (see TEAM.md)
// Browser-side helpers for the current user. Identity lives in an httpOnly session cookie
// set by the server on login/sign-up/guest, not localStorage, so API routes can trust it.
//
//   await logIn("me@example.com", "password");   // or signUp(...) / continueAsGuest()
//   await ensureUser();                          // refresh session; throws if signed out
//   const me = await getMe();                    // { user, preferences, location }
//   await savePreferences({ tastes: ["dumplings"] });
//   await shareCurrentLocation();                // asks for GPS permission
import type { DIETARY_VOCAB } from "@/features/ml/vocab";
import type { Preferences, PublicUser, StoredLocation } from "@/features/users";

export type DietaryNeed = (typeof DIETARY_VOCAB)[number];

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

// --- accounts ---
export const signUp = (email: string, password: string, displayName?: string) =>
  call<{ user: PublicUser }>("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password, ...(displayName ? { displayName } : {}) }) });
export const logIn = (email: string, password: string) =>
  call<{ user: PublicUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
/** `credential` is the ID token from the Google button (components/auth/GoogleButton). */
export const logInWithGoogle = (credential: string) =>
  call<{ user: PublicUser }>("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) });
export const continueAsGuest = () => call<{ user: PublicUser }>("/api/auth/guest", { method: "POST" });
export const logOut = () => call<void>("/api/auth/logout", { method: "POST" });
export const completeOnboarding = (answers: { dietary: DietaryNeed[]; avoid?: string[]; displayName?: string }) =>
  call<{ user: PublicUser }>("/api/me/onboarding", { method: "POST", body: JSON.stringify(answers) });

// --- profile ---
export const ensureUser = () => call<{ user: PublicUser }>("/api/me", { method: "POST" });
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
