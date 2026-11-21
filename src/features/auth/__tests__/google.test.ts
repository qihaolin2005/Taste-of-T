import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { createTestDb } from "@/test/db";
import { createGuest, GoogleTokenError, logIn, signInWithGoogle, signUp, signUpSchema, verifyGoogleIdToken } from "@/features/auth";

const db = createTestDb();
afterAll(() => db.$disconnect());

const CLIENT_ID = "test-client.apps.googleusercontent.com";
let keys: JWTVerifyGetKey;
let sign: (claims: Record<string, unknown>, opts?: { iss?: string; aud?: string; exp?: string }) => Promise<string>;
let signWithOtherKey: (claims: Record<string, unknown>) => Promise<string>;

// Stand in for Google: our own RS256 key and JWKS, same token shape as Google's.
beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
  const make = (key: CryptoKey) => (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.iss ?? "https://accounts.google.com")
      .setAudience(opts.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "1h")
      .sign(key);
  sign = make(privateKey);
  signWithOtherKey = make(other.privateKey);
});

let n = 0;
const person = () => {
  n += 1;
  return { sub: `g-${Date.now()}-${n}`, email: `Person${n}-${Date.now()}@Gmail.com`, email_verified: true, name: "Pat Example" };
};
const verify = (t: string) => verifyGoogleIdToken(t, { clientId: CLIENT_ID, keys });

describe("verifyGoogleIdToken", () => {
  it("accepts a valid Google token and lowercases the email", async () => {
    const p = person();
    expect(await verify(await sign(p))).toEqual({ sub: p.sub, email: p.email.toLowerCase(), name: "Pat Example" });
  });

  it("rejects tokens for another app, from another issuer, expired, or forged", async () => {
    const p = person();
    await expect(verify(await sign(p, { aud: "someone-elses-app" }))).rejects.toBeInstanceOf(GoogleTokenError);
    await expect(verify(await sign(p, { iss: "https://evil.example" }))).rejects.toBeInstanceOf(GoogleTokenError);
    await expect(verify(await sign(p, { exp: "-1m" }))).rejects.toBeInstanceOf(GoogleTokenError);
    await expect(verify(await signWithOtherKey(p))).rejects.toBeInstanceOf(GoogleTokenError);
    await expect(verify("not.a.jwt")).rejects.toBeInstanceOf(GoogleTokenError);
  });

  it("rejects unverified emails", async () => {
    await expect(verify(await sign({ ...person(), email_verified: false }))).rejects.toThrow("isn't verified");
  });

  it("refuses when Google sign-in isn't configured", async () => {
    await expect(verifyGoogleIdToken(await sign(person()), { clientId: "", keys })).rejects.toThrow("isn't configured");
  });
});

describe("signInWithGoogle", () => {
  it("creates a new account that still needs onboarding, then finds it again", async () => {
    const id = await verify(await sign(person()));
    const first = await signInWithGoogle(db, id, null);
    expect(first).toMatchObject({ email: id.email, isGuest: false, onboarded: false, displayName: "Pat Example" });
    const again = await signInWithGoogle(db, id, null);
    expect(again.id).toBe(first.id);
  });

  it("links to an existing account with the same email and removes its unverified password", async () => {
    const p = person();
    const existing = await signUp(db, signUpSchema.parse({ email: p.email, password: "attacker-set-pw" }), null);
    const user = await signInWithGoogle(db, await verify(await sign(p)), null);
    expect(user.id).toBe(existing.id);
    expect(await logIn(db, { email: p.email.toLowerCase(), password: "attacker-set-pw" })).toBeNull();
  });

  it("upgrades the current guest so their progress carries over", async () => {
    const guest = await createGuest(db);
    await db.stamp.create({ data: { userId: guest.id, stationId: "place-pktrm" } });
    const user = await signInWithGoogle(db, await verify(await sign(person())), guest.id);
    expect(user.id).toBe(guest.id);
    expect(user.isGuest).toBe(false);
    expect(await db.stamp.count({ where: { userId: guest.id } })).toBe(1);
  });
});
