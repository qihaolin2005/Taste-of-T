// Owner: P2 - Data & Integrations (see TEAM.md)
// Anonymous session via a signed httpOnly cookie. Use only in Route Handlers / Server Functions.
import "server-only";
import { cookies } from "next/headers";
import { signUserId, verifyToken } from "./sessionToken";

const COOKIE = "tot_session";
const ONE_YEAR_S = 60 * 60 * 24 * 365;
const DEV_SECRET = "dev-only-insecure-secret-change-me";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return DEV_SECRET;
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE)?.value, secret());
}

export async function setSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, signUserId(userId, secret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_S,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
