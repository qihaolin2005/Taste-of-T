// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Rooms ("Start an Adventure"): create with a 4-letter code, look up by code, join, leave.
//
// Privacy: anyone with the code can see who's in the room and where they're starting from,
// but NOT other members' budgets, home stations, or dietary needs. The planner reads those
// server-side; the room view only shows them for "you".
import { Prisma } from "@/generated/prisma/client";
import { getStation } from "@/lib/mbta/stations";
import { readTags } from "@/features/users/schemas";
import type { Db } from "@/features/users";
import { generateCode, normalizeCode } from "./code";
import type { CreateRoomInput, MemberInput, StopCategory } from "./schemas";

export const MAX_MEMBERS = 12;
const ROOM_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000; // rooms (and their codes) last 2 days
const CREATE_ATTEMPTS = 8;

export class RoomNotFoundError extends Error {
  constructor() {
    super("No group with that code. Check the letters and try again.");
  }
}
/**
 * The code is real but the group is over (the host deleted it, or it expired). Not a guess, so
 * unlike RoomNotFoundError it doesn't count toward the wrong-code limit: members still looking at
 * the page mustn't lock their whole network out of groups.
 */
export class RoomEndedError extends Error {
  constructor() {
    super("This group has ended. Start a new one or join another.");
  }
}

/** You're still in another live group: leave it (or, as host, delete it) first. */
export class AlreadyInRoomError extends Error {
  constructor(readonly code: string) {
    super(`You're already in group ${code}. Leave it first to start or join another one.`);
  }
}

/** Only the host can do this (e.g. delete the group). */
export class NotHostError extends Error {
  constructor() {
    super("Only the group's host can do that.");
  }
}

export class RoomFullError extends Error {
  constructor() {
    super(`This group is full (${MAX_MEMBERS} people max).`);
  }
}

export type RoomMemberView = {
  id: string;
  name: string;
  startStation: { id: string; name: string };
  isYou: boolean;
  isHost: boolean;
};

export type YourMembership = {
  name: string;
  startStationId: string;
  homeStationId: string;
  budget: number;
  leaveBy: number | null;
  maxWalkMinutes: number | null;
  dietary: string[];
  tastes: string[];
};

export type RoomView = {
  code: string;
  name: string;
  date: string;
  startTime: number;
  slots: StopCategory[];
  status: string;
  expiresAt: string;
  youAreHost: boolean;
  you: YourMembership | null;
  members: RoomMemberView[];
  maxMembers: number;
};

/** Boston calendar date ("YYYY-MM-DD") for tonight or tomorrow. */
export function bostonDate(day: "tonight" | "tomorrow", now = new Date()): string {
  const d = new Date(now.getTime() + (day === "tomorrow" ? 86_400_000 : 0));
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

const stationRef = (id: string) => ({ id, name: getStation(id)?.name ?? id });

async function findLiveRoom(db: Db, code: string, now: Date) {
  const room = await db.room.findUnique({ where: { id: code }, include: { members: { orderBy: { joinedAt: "asc" } } } });
  if (!room || room.expiresAt <= now) return null;
  return room;
}

/** The live room, or throws: RoomEndedError for a real code whose group is over, else RoomNotFoundError. */
async function liveRoomOrThrow(db: Db, code: string | null, now: Date) {
  const room = code ? await findLiveRoom(db, code, now) : null;
  if (room) return room;
  if (code && (await db.room.count({ where: { id: code } }))) throw new RoomEndedError();
  throw new RoomNotFoundError();
}

/**
 * The group you're in right now: the newest live (unexpired) room where you're a member or the
 * host. The Adventure tab sends you back here until you leave, the host deletes it, everyone
 * leaves, or it expires. null when you're in none.
 */
export async function currentRoomCode(db: Db, userId: string, now = new Date()): Promise<string | null> {
  const room = await db.room.findFirst({
    where: { expiresAt: { gt: now }, OR: [{ hostUserId: userId }, { members: { some: { userId } } }] },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return room?.id ?? null;
}

/**
 * Create a room with a fresh random code. If the random code belongs to an expired room,
 * that old room is deleted and the code reused; if it belongs to a live room, try again.
 */
export async function createRoom(db: Db, hostUserId: string, input: CreateRoomInput, now = new Date(), nextCode = generateCode): Promise<string> {
  // One group at a time: you come back to the one you're in until it's over.
  const current = await currentRoomCode(db, hostUserId, now);
  if (current) throw new AlreadyInRoomError(current);
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = nextCode();
    const existing = await db.room.findUnique({ where: { id: code }, select: { expiresAt: true } });
    if (existing && existing.expiresAt > now) continue;
    if (existing) await db.room.delete({ where: { id: code } });
    try {
      await db.room.create({
        data: {
          id: code,
          name: input.name,
          hostUserId,
          date: bostonDate(input.day, now),
          startTime: input.startTime,
          slots: input.slots,
          expiresAt: new Date(now.getTime() + ROOM_LIFETIME_MS),
        },
      });
      return code;
    } catch (err) {
      // Someone grabbed the same code in the same instant; try another.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Couldn't find a free room code. Try again.");
}

/** Room as seen by `viewerUserId`. Throws RoomNotFoundError for unknown or expired codes. */
export async function getRoomView(db: Db, rawCode: string, viewerUserId: string, now = new Date()): Promise<RoomView> {
  const room = await liveRoomOrThrow(db, normalizeCode(rawCode), now);

  const mine = room.members.find((m) => m.userId === viewerUserId) ?? null;
  return {
    code: room.id,
    name: room.name,
    date: room.date,
    startTime: room.startTime,
    slots: readTags(room.slots) as StopCategory[],
    status: room.status,
    expiresAt: room.expiresAt.toISOString(),
    youAreHost: room.hostUserId === viewerUserId,
    you: mine && {
      name: mine.name,
      startStationId: mine.startStationId,
      homeStationId: mine.homeStationId,
      budget: mine.budget,
      leaveBy: mine.leaveBy,
      maxWalkMinutes: mine.maxWalkMinutes,
      dietary: readTags(mine.dietary),
      tastes: readTags(mine.tastes),
    },
    members: room.members.map((m) => ({
      id: m.id,
      name: m.name,
      startStation: stationRef(m.startStationId),
      isYou: m.userId === viewerUserId,
      isHost: m.userId !== null && m.userId === room.hostUserId,
    })),
    maxMembers: MAX_MEMBERS,
  };
}

/**
 * Join a room, or update your info if you're already in it. Tastes, foods to avoid, and
 * dietary needs are copied from your profile, so the planner treats them as hard constraints.
 */
export async function joinRoom(db: Db, rawCode: string, userId: string, input: MemberInput, now = new Date()): Promise<RoomView> {
  const room = await liveRoomOrThrow(db, normalizeCode(rawCode), now);

  const already = room.members.some((m) => m.userId === userId);
  if (!already) {
    // One group at a time (the host joining their own new group is fine).
    const current = await currentRoomCode(db, userId, now);
    if (current && current !== room.id) throw new AlreadyInRoomError(current);
  }
  if (!already && room.members.length >= MAX_MEMBERS) throw new RoomFullError();

  const prefs = await db.userPreferences.findUnique({ where: { userId } });
  const data = {
    name: input.name,
    startStationId: input.startStationId,
    homeStationId: input.homeStationId,
    budget: input.budget,
    leaveBy: input.leaveBy ?? null,
    maxWalkMinutes: input.maxWalkMinutes ?? prefs?.maxWalkMinutes ?? null,
    tastes: readTags(prefs?.tastes),
    avoid: readTags(prefs?.avoid),
    dietary: readTags(prefs?.dietary),
  };
  await db.roomMember.upsert({
    where: { roomId_userId: { roomId: room.id, userId } },
    create: { roomId: room.id, userId, ...data },
    update: data,
  });
  return getRoomView(db, room.id, userId, now);
}

/**
 * Leave a room. If you're the host, the earliest-joined remaining member becomes host, so the group
 * can still start its adventure. Once everyone has left, it's nobody's current group; the room
 * itself stays until it expires, so its top 5 can still be claimed for points (rewards look up the
 * squad's plan and swipes).
 */
export async function leaveRoom(db: Db, rawCode: string, userId: string): Promise<void> {
  const code = normalizeCode(rawCode);
  if (!code) return;
  await db.$transaction(async (tx) => {
    await tx.roomMember.deleteMany({ where: { roomId: code, userId } });
    const room = await tx.room.findUnique({ where: { id: code }, include: { members: { orderBy: { joinedAt: "asc" } } } });
    if (room?.hostUserId === userId) {
      await tx.room.update({ where: { id: code }, data: { hostUserId: room.members.find((m) => m.userId)?.userId ?? null } });
    }
  });
}

/**
 * Host only: end the group for everyone, now. It's marked expired rather than deleted, so it's gone
 * from the app (the code stops working) but its plan and swipes stay: everyone can still claim
 * points for the night's top 5, and the swipes still count toward their tastes.
 */
export async function deleteRoom(db: Db, rawCode: string, userId: string, now = new Date()): Promise<void> {
  const code = normalizeCode(rawCode);
  const room = code ? await findLiveRoom(db, code, now) : null;
  if (!room) throw new RoomNotFoundError();
  if (room.hostUserId !== userId) throw new NotHostError();
  await db.room.update({ where: { id: room.id }, data: { expiresAt: now } });
}
