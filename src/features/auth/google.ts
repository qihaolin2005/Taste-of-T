// Owner: P2 - Data & Integrations (see TEAM.md)
// Sign in with Google. The browser gets an ID token (a JWT signed by Google) from the
// Google Identity Services button; we verify it here and sign the user in.
//
// Verification: signature against Google's published keys, issuer is Google, audience is OUR
// client id (so tokens minted for other apps are rejected), not expired, email verified.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { toPublicUser, type Db, type PublicUser } from "@/features/users";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type GoogleIdentity = { sub: string; email: string; name: string | null };

export class GoogleTokenError extends Error {}

export function googleClientId(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null;
}

export async function verifyGoogleIdToken(
  credential: string,
  opts: { clientId: string; keys?: JWTVerifyGetKey } = { clientId: googleClientId() ?? "" },
): Promise<GoogleIdentity> {
  if (!opts.clientId) throw new GoogleTokenError("Google sign-in isn't configured");
  let payload;
  try {
    ({ payload } = await jwtVerify(credential, opts.keys ?? googleKeys, { issuer: GOOGLE_ISSUERS, audience: opts.clientId }));
  } catch {
    throw new GoogleTokenError("Google sign-in failed. Please try again.");
  }
  const { sub, email, email_verified, name } = payload as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!sub || !email) throw new GoogleTokenError("Google didn't share an email address");
  if (email_verified !== true) throw new GoogleTokenError("Your Google email isn't verified");
  return { sub, email: email.toLowerCase(), name: name?.trim().slice(0, 40) || null };
}

/**
 * Find or create the user for a verified Google identity:
 *  1. Already linked (same googleSub)        -> that user.
 *  2. Same email as an existing account       -> link Google to it. Google proved the person owns
 *     the email; we never verified emails for password sign-ups, so we also REMOVE that password.
 *     Otherwise someone could pre-register a victim's email and keep a password into their account.
 *  3. Current device is a guest               -> upgrade the guest (keeps stamps/XP).
 *  4. Otherwise                               -> new account (goes through onboarding).
 */
export async function signInWithGoogle(db: Db, id: GoogleIdentity, currentUserId: string | null): Promise<PublicUser> {
  const linked = await db.user.findUnique({ where: { googleSub: id.sub } });
  if (linked) return toPublicUser(linked);

  const byEmail = await db.user.findUnique({ where: { email: id.email } });
  if (byEmail) {
    return toPublicUser(await db.user.update({ where: { id: byEmail.id }, data: { googleSub: id.sub, passwordHash: null } }));
  }

  const data = { email: id.email, googleSub: id.sub, ...(id.name ? { displayName: id.name } : {}) };
  const current = currentUserId ? await db.user.findUnique({ where: { id: currentUserId }, select: { id: true, email: true } }) : null;
  if (current && current.email === null) return toPublicUser(await db.user.update({ where: { id: current.id }, data }));
  return toPublicUser(await db.user.create({ data: { ...data, preferences: { create: {} } } }));
}
