// Owner: P2 - Data & Integrations (see TEAM.md)
// User profile CRUD. All functions take the Prisma client so tests can pass their own.
import type { PrismaClient } from "@/generated/prisma/client";
import type { ProfileUpdate } from "./schemas";

export type Db = PrismaClient;

export type PublicUser = {
  id: string;
  displayName: string;
  avatar: string | null;
  xp: number;
  createdAt: string;
};

function toPublic(u: { id: string; displayName: string; avatar: string | null; xp: number; createdAt: Date }): PublicUser {
  return { id: u.id, displayName: u.displayName, avatar: u.avatar, xp: u.xp, createdAt: u.createdAt.toISOString() };
}

export async function getUser(db: Db, userId: string): Promise<PublicUser | null> {
  const u = await db.user.findUnique({ where: { id: userId } });
  return u ? toPublic(u) : null;
}

/** Return the session's user, or create a fresh one (with empty preferences) if none/invalid. */
export async function getOrCreateUser(db: Db, userId: string | null): Promise<{ user: PublicUser; created: boolean }> {
  if (userId) {
    const existing = await getUser(db, userId);
    if (existing) return { user: existing, created: false };
  }
  const u = await db.user.create({ data: { preferences: { create: {} } } });
  return { user: toPublic(u), created: true };
}

export async function updateProfile(db: Db, userId: string, patch: ProfileUpdate): Promise<PublicUser> {
  const u = await db.user.update({ where: { id: userId }, data: patch });
  return toPublic(u);
}

/** Delete the user and everything they own (cascades: preferences, location, check-ins, ...). */
export async function deleteUser(db: Db, userId: string): Promise<void> {
  await db.user.deleteMany({ where: { id: userId } });
}
