import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rateLimit";
import { getPreferences } from "@/features/users";
import {
  completeOnboarding,
  createGuest,
  EmailTakenError,
  gateRedirect,
  logIn,
  logInSchema,
  onboardingSchema,
  safeNextPath,
  signUp,
  signUpSchema,
} from "@/features/auth";

const db = createTestDb();
afterAll(() => db.$disconnect());

let n = 0;
const freshEmail = () => `user${++n}-${Date.now()}@example.com`;

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong horse", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("salts: same password, different hashes", async () => {
    expect(await hashPassword("same-password")).not.toBe(await hashPassword("same-password"));
  });
});

describe("sign up and log in", () => {
  it("creates an account that needs onboarding, and never exposes the hash", async () => {
    const email = freshEmail();
    const user = await signUp(db, signUpSchema.parse({ email, password: "password123" }), null);
    expect(user).toMatchObject({ email, isGuest: false, onboarded: false });
    expect(JSON.stringify(user)).not.toContain("scrypt");
  });

  it("normalizes email case and whitespace", async () => {
    const email = freshEmail();
    await signUp(db, signUpSchema.parse({ email: `  ${email.toUpperCase()} `, password: "password123" }), null);
    expect(await logIn(db, logInSchema.parse({ email, password: "password123" }))).not.toBeNull();
  });

  it("rejects a duplicate email", async () => {
    const email = freshEmail();
    await signUp(db, signUpSchema.parse({ email, password: "password123" }), null);
    await expect(signUp(db, signUpSchema.parse({ email, password: "different123" }), null)).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("returns null for a wrong password or unknown email", async () => {
    const email = freshEmail();
    await signUp(db, signUpSchema.parse({ email, password: "password123" }), null);
    expect(await logIn(db, { email, password: "nope-nope" })).toBeNull();
    expect(await logIn(db, { email: freshEmail(), password: "password123" })).toBeNull();
  });

  it("upgrades a guest in place so their progress carries over", async () => {
    const guest = await createGuest(db);
    await db.stamp.create({ data: { userId: guest.id, stationId: "place-chncl" } });
    const user = await signUp(db, signUpSchema.parse({ email: freshEmail(), password: "password123" }), guest.id);
    expect(user.id).toBe(guest.id);
    expect(user.isGuest).toBe(false);
    expect(await db.stamp.count({ where: { userId: guest.id } })).toBe(1);
  });

  it("validates input: short passwords and bad emails are rejected", () => {
    expect(signUpSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: "not-an-email", password: "password123" }).success).toBe(false);
  });
});

describe("onboarding", () => {
  it("saves dietary restrictions and marks the account onboarded", async () => {
    const user = await signUp(db, signUpSchema.parse({ email: freshEmail(), password: "password123" }), null);
    const done = await completeOnboarding(db, user.id, onboardingSchema.parse({ dietary: ["vegetarian", "nut-free"], avoid: ["Seafood"], displayName: "Sam" }));
    expect(done).toMatchObject({ onboarded: true, displayName: "Sam" });
    expect(await getPreferences(db, user.id)).toMatchObject({ dietary: ["vegetarian", "nut-free"], avoid: ["seafood"] });
    // and the next login reports it, so the proxy skips onboarding
    expect((await logIn(db, { email: done.email!, password: "password123" }))!.onboarded).toBe(true);
  });

  it("accepts 'no restrictions' but rejects values outside the dietary list", () => {
    expect(onboardingSchema.safeParse({ dietary: [] }).success).toBe(true);
    expect(onboardingSchema.safeParse({ dietary: ["carnivore"] }).success).toBe(false);
  });
});

describe("gateRedirect", () => {
  const out = { signedIn: false, onboarded: false };
  const fresh = { signedIn: true, onboarded: false };
  const done = { signedIn: true, onboarded: true };

  it("sends signed-out visitors to login, remembering where they were going", () => {
    expect(gateRedirect("/", out)).toBe("/login");
    expect(gateRedirect("/map", out)).toBe("/login?next=%2Fmap");
    expect(gateRedirect("/login", out)).toBeNull();
  });

  it("sends new accounts to onboarding until they finish", () => {
    expect(gateRedirect("/", fresh)).toBe("/onboarding");
    expect(gateRedirect("/map", fresh)).toBe("/onboarding");
    expect(gateRedirect("/onboarding", fresh)).toBeNull();
  });

  it("lets onboarded users in, and bounces them off login/onboarding", () => {
    expect(gateRedirect("/map", done)).toBeNull();
    expect(gateRedirect("/login", done)).toBe("/");
    expect(gateRedirect("/onboarding", done)).toBe("/");
  });

  it("always allows the /demo projector page", () => {
    expect(gateRedirect("/demo", out)).toBeNull();
  });

  it("only follows same-site next paths", () => {
    expect(safeNextPath("/map")).toBe("/map");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});

describe("rateLimit", () => {
  it("allows up to the limit per window, then blocks until it resets", () => {
    const key = `t-${Date.now()}`;
    const t0 = 1_000_000;
    expect([1, 2, 3].map(() => rateLimit(key, 3, 1000, t0))).toEqual([true, true, true]);
    expect(rateLimit(key, 3, 1000, t0 + 10)).toBe(false);
    expect(rateLimit(key, 3, 1000, t0 + 1001)).toBe(true);
  });
});
