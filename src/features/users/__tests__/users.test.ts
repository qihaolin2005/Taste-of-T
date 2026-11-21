import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import {
  clearLocation,
  deleteUser,
  getLocation,
  getOrCreateUser,
  getPreferences,
  getUser,
  LocationSharingDisabledError,
  preferencesUpdateSchema,
  recordLocation,
  updatePreferences,
  updateProfile,
} from "@/features/users";

const db = createTestDb();
afterAll(() => db.$disconnect());

// Two real-ish stations for nearest-station tests.
const STATIONS = [
  { id: "place-chncl", lat: 42.35245, lng: -71.06276 }, // Chinatown
  { id: "place-harsq", lat: 42.37336, lng: -71.11895 }, // Harvard
];

async function newUser() {
  return (await getOrCreateUser(db, null)).user;
}

describe("users", () => {
  it("creates a user once and returns the same user for its session id", async () => {
    const first = await getOrCreateUser(db, null);
    expect(first.created).toBe(true);
    const again = await getOrCreateUser(db, first.user.id);
    expect(again).toEqual({ user: first.user, created: false });
  });

  it("creates a new user when the session id no longer exists", async () => {
    const { created } = await getOrCreateUser(db, "deleted-or-made-up-id");
    expect(created).toBe(true);
  });

  it("updates the display name", async () => {
    const u = await newUser();
    expect((await updateProfile(db, u.id, { displayName: "Sam" })).displayName).toBe("Sam");
  });

  it("deleting a user removes their preferences and location", async () => {
    const u = await newUser();
    await updatePreferences(db, u.id, { shareLocation: true });
    await recordLocation(db, u.id, { lat: 42.35, lng: -71.06 }, STATIONS);
    await deleteUser(db, u.id);
    expect(await getUser(db, u.id)).toBeNull();
    expect(await db.userPreferences.findUnique({ where: { userId: u.id } })).toBeNull();
    expect(await db.userLocation.findUnique({ where: { userId: u.id } })).toBeNull();
  });
});

describe("preferences", () => {
  it("starts empty with location sharing off", async () => {
    const u = await newUser();
    expect(await getPreferences(db, u.id)).toMatchObject({ tastes: [], avoid: [], shareLocation: false, defaultBudget: null });
  });

  it("saves a partial update and keeps other fields", async () => {
    const u = await newUser();
    await updatePreferences(db, u.id, { tastes: ["dumplings"], defaultBudget: 30 });
    const p = await updatePreferences(db, u.id, { maxWalkMinutes: 8 });
    expect(p).toMatchObject({ tastes: ["dumplings"], defaultBudget: 30, maxWalkMinutes: 8 });
  });

  it("normalizes tags (trim, lowercase, dedupe)", () => {
    const parsed = preferencesUpdateSchema.parse({ tastes: [" Dumplings", "dumplings", "BOBA "] });
    expect(parsed.tastes).toEqual(["dumplings", "boba"]);
  });

  it("rejects unknown fields and bad values", () => {
    expect(preferencesUpdateSchema.safeParse({ isAdmin: true }).success).toBe(false);
    expect(preferencesUpdateSchema.safeParse({ defaultBudget: -5 }).success).toBe(false);
  });
});

describe("location", () => {
  it("refuses to store location unless sharing is on", async () => {
    const u = await newUser();
    await expect(recordLocation(db, u.id, { lat: 42.35, lng: -71.06 }, STATIONS)).rejects.toBeInstanceOf(LocationSharingDisabledError);
    expect(await getLocation(db, u.id)).toBeNull();
  });

  it("stores a rounded location and the nearest station, overwriting the previous one", async () => {
    const u = await newUser();
    await updatePreferences(db, u.id, { shareLocation: true });
    await recordLocation(db, u.id, { lat: 42.3731, lng: -71.119 }, STATIONS);
    const loc = await recordLocation(db, u.id, { lat: 42.352456789, lng: -71.062712345, accuracyM: 15 }, STATIONS);
    expect(loc).toMatchObject({ lat: 42.3525, lng: -71.0627, accuracyM: 15, nearestStationId: "place-chncl" });
    expect(await db.userLocation.count({ where: { userId: u.id } })).toBe(1);
  });

  it("has no nearest station when far from the T", async () => {
    const u = await newUser();
    await updatePreferences(db, u.id, { shareLocation: true });
    const loc = await recordLocation(db, u.id, { lat: 40.7128, lng: -74.006 }, STATIONS); // NYC
    expect(loc.nearestStationId).toBeNull();
  });

  it("turning sharing off deletes the stored location", async () => {
    const u = await newUser();
    await updatePreferences(db, u.id, { shareLocation: true });
    await recordLocation(db, u.id, { lat: 42.35, lng: -71.06 }, STATIONS);
    await updatePreferences(db, u.id, { shareLocation: false });
    expect(await getLocation(db, u.id)).toBeNull();
  });

  it("clearLocation forgets it", async () => {
    const u = await newUser();
    await updatePreferences(db, u.id, { shareLocation: true });
    await recordLocation(db, u.id, { lat: 42.35, lng: -71.06 }, STATIONS);
    await clearLocation(db, u.id);
    expect(await getLocation(db, u.id)).toBeNull();
  });
});
