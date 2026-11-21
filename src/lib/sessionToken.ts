// Owner: P2 - Data & Integrations (see TEAM.md)
// Pure sign/verify for the anonymous session cookie: "<userId>.<hmac>".
// Signing stops someone from editing the cookie to impersonate another user id.
// This is not real auth: anyone holding the cookie is that user. Fine for the MVP.
import { createHmac, timingSafeEqual } from "node:crypto";

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
