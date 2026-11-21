// Owner: P2 - Data & Integrations (see TEAM.md)
// Pure helpers for the session cookie: "<userId>.<hmac>". No Next.js imports, so both
// Route Handlers (via session.ts) and src/proxy.ts can use them.
// Signing stops someone from editing the cookie to become another user id.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "tot_session";
/** Non-sensitive hint for the proxy: "1" once onboarding is done. Worst case if forged: you skip your own onboarding. */
export const ONBOARDED_COOKIE = "tot_onboarded";

const DEV_SECRET = "dev-only-insecure-secret-change-me";

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return DEV_SECRET;
}

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function signUserId(userId: string, secret: string): string {
  return `${userId}.${hmac(userId, secret)}`;
}

/** Returns the user id if the token is untampered, else null. */
export function verifyToken(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(hmac(userId, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}
