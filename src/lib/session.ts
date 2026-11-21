// Owner: P2 - Data & Integrations (see TEAM.md)
// Session via a signed httpOnly cookie. Use only in Route Handlers / Server Functions.
import "server-only";
import { cookies } from "next/headers";
import { ONBOARDED_COOKIE, SESSION_COOKIE, sessionSecret, signUserId, verifyToken } from "./sessionToken";

const ONE_YEAR_S = 60 * 60 * 24 * 365;
const cookieOpts = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ONE_YEAR_S,
});

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  return verifyToken(store.get(SESSION_COOKIE)?.value, sessionSecret());
}

/** Sign the user in on this device. `onboarded` tells the proxy whether to show onboarding. */
export async function setSession(userId: string, onboarded?: boolean): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, signUserId(userId, sessionSecret()), cookieOpts());
  if (onboarded !== undefined) await setOnboarded(onboarded);
}

export async function setOnboarded(onboarded: boolean): Promise<void> {
  const store = await cookies();
  if (onboarded) store.set(ONBOARDED_COOKIE, "1", cookieOpts());
  else store.delete(ONBOARDED_COOKIE);
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ONBOARDED_COOKIE);
}
