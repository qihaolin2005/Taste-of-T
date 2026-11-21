// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Database access for squad sessions and swipe history. Every function takes the Prisma
// client so tests can pass their own. No business rules here: see service.ts.
import type { PrismaClient } from "@/generated/prisma/client";
import type { GroupVote, SessionDeck, SquadPlan, Swipe } from "@/features/ml";

export type Db = PrismaClient;

export const ROOM_STATUS = { collecting: "collecting", swiping: "swiping", planned: "planned" } as const;
export type RoomStatus = (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS];

export async function getRoomWithMembers(db: Db, roomId: string) {
  return db.room.findUnique({ where: { id: roomId }, include: { members: { orderBy: { joinedAt: "asc" } } } });
}
export type RoomWithMembers = NonNullable<Awaited<ReturnType<typeof getRoomWithMembers>>>;

/**
 * collecting -> swiping, saving the deck. Atomic: returns false if the room wasn't
 * "collecting" (already started, finished, or a concurrent start won).
 */
export async function beginSwiping(db: Db, roomId: string, deck: SessionDeck, now = new Date()): Promise<boolean> {
  const { count } = await db.room.updateMany({
    where: { id: roomId, status: ROOM_STATUS.collecting },
    data: { status: ROOM_STATUS.swiping, deck: deck as object, startedAt: now },
  });
  return count === 1;
}

/** Record (or change) one member's vote on one place in a session. */
export async function upsertSquadSwipe(db: Db, s: { roomId: string; memberId: string; userId: string; placeId: string; liked: boolean }) {
  return db.swipe.upsert({
    where: { roomId_memberId_placeId: { roomId: s.roomId, memberId: s.memberId, placeId: s.placeId } },
    create: { ...s, source: "group" },
    update: { liked: s.liked },
  });
}

export async function listRoomVotes(db: Db, roomId: string): Promise<GroupVote[]> {
  const rows = await db.swipe.findMany({ where: { roomId }, orderBy: { updatedAt: "asc" } });
  return rows.map((r) => ({ memberId: r.memberId!, placeId: r.placeId, liked: r.liked, at: r.updatedAt.getTime() }));
}

/**
 * swiping -> planned and save the plan, atomically. Only the caller that flips the status
 * creates the Plan, so two "last swipes" at the same moment can't make two plans.
 * Returns the room's plan either way.
 */
export async function completeRoom(db: Db, roomId: string, plan: SquadPlan, request: unknown, hostUserId: string | null, now = new Date()) {
  return db.$transaction(async (tx) => {
    const { count } = await tx.room.updateMany({ where: { id: roomId, status: ROOM_STATUS.swiping }, data: { status: ROOM_STATUS.planned, finishedAt: now } });
    if (count === 1) return tx.plan.create({ data: { roomId, userId: hostUserId, request: request as object, result: plan as object } });
    return tx.plan.findFirst({ where: { roomId }, orderBy: { createdAt: "desc" } });
  });
}

export async function latestRoomPlan(db: Db, roomId: string) {
  return db.plan.findFirst({ where: { roomId }, orderBy: { createdAt: "desc" } });
}

// ------------------------------------------------------------- swipe history

/** A user's swipes (solo and group), most recent first, as the ML Swipe type. */
export async function loadUserSwipes(db: Db, userId: string, take = 200): Promise<Swipe[]> {
  const rows = await db.swipe.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take });
  return rows.map((r) => ({
    placeId: r.placeId,
    liked: r.liked,
    source: r.source === "group" ? "group" : "solo",
    at: r.updatedAt.getTime(),
    ...(r.roomId ? { sessionId: r.roomId } : {}),
  }));
}

/** A swipe outside any squad (e.g. a solo "for you" deck). Swiping the same place again updates it. */
export async function recordSoloSwipe(db: Db, userId: string, placeId: string, liked: boolean) {
  const existing = await db.swipe.findFirst({ where: { userId, placeId, roomId: null }, select: { id: true } });
  if (existing) return db.swipe.update({ where: { id: existing.id }, data: { liked } });
  return db.swipe.create({ data: { userId, placeId, liked, source: "solo" } });
}
