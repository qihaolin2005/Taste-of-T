// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// UserContext: everything an ML model is allowed to know about one person, as one
// versioned, validated JSON object. This is THE contract between the app and any model.
//
// Privacy rules (enforced here, so no model code can get around them):
//  - No name, avatar, or raw user id. `subjectId` is a salted hash: stable per user, not reversible.
//  - Location only if the user opted in (shareLocation) and it's < 24h old, and coarsened
//    to 3 decimals (~110 m). The nearest station is usually all a model needs.
//  - History is summarized (counts, ids), with no timestamps of where someone was.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { getStation } from "@/lib/mbta/stations";
import { readTags } from "@/features/users/schemas";
import { lineFamily, LINE_FAMILIES, type LineFamily } from "./vocab";

export const CONTEXT_VERSION = 1;
const LOCATION_MAX_AGE_MIN = 24 * 60;
const MAX_HISTORY_ITEMS = 50;

const lineFamilySchema = z.enum(LINE_FAMILIES);

export const userContextSchema = z.object({
  version: z.literal(CONTEXT_VERSION),
  subjectId: z.string(),
  /** "user" = signed-in device; "member" = a room member who may have no account. */
  kind: z.enum(["user", "member"]),
  generatedAt: z.string(),
  preferences: z.object({
    tastes: z.array(z.string()),
    avoid: z.array(z.string()),
    dietary: z.array(z.string()),
    budgetPerPerson: z.number().nullable(),
    maxWalkMinutes: z.number().nullable(),
  }),
  stations: z.object({
    home: z.string().nullable(),
    start: z.string().nullable(),
    homeLines: z.array(lineFamilySchema),
  }),
  location: z
    .object({
      nearestStationId: z.string().nullable(),
      lat: z.number(),
      lng: z.number(),
      accuracyM: z.number().nullable(),
      ageMinutes: z.number(),
    })
    .nullable(),
  time: z.object({
    /** Boston local time (America/New_York), not server time. */
    localHour: z.number().int().min(0).max(23),
    minutesAfterMidnight: z.number().int().min(0).max(1439),
    dayOfWeek: z.number().int().min(0).max(6), // 0 = Sunday
    isWeekend: z.boolean(),
  }),
  history: z.object({
    xp: z.number(),
    checkInCount: z.number().int(),
    daysSinceLastCheckIn: z.number().nullable(),
    stampedStationIds: z.array(z.string()),
    linesVisited: z.array(lineFamilySchema),
    ratings: z.array(z.object({ placeId: z.string(), score: z.number() })),
    wishlistPlaceIds: z.array(z.string()),
  }),
  consent: z.object({ location: z.boolean() }),
});
export type UserContext = z.infer<typeof userContextSchema>;

// ------------------------------------------------------------------ helpers

function salt(): string {
  return process.env.ML_SUBJECT_SALT ?? process.env.SESSION_SECRET ?? "dev-only-ml-salt";
}

/** Stable pseudonymous id: same person -> same id, but the id can't be turned back into a user id. */
export function pseudonymousId(kind: "user" | "member", id: string): string {
  return createHash("sha256").update(`${salt()}:${kind}:${id}`).digest("base64url").slice(0, 22);
}

const round3 = (n: number) => Math.round(n * 1e3) / 1e3;

export function bostonTime(now: Date): UserContext["time"] {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { localHour: hour, minutesAfterMidnight: hour * 60 + minute, dayOfWeek, isWeekend: dayOfWeek === 0 || dayOfWeek === 6 };
}

function linesAt(stationId: string | null | undefined): LineFamily[] {
  const st = stationId ? getStation(stationId) : undefined;
  return [...new Set((st?.lines ?? []).map(lineFamily).filter((f): f is LineFamily => f !== null))];
}

// ------------------------------------------------------------------ builders

/** Build the context for a signed-in user from the database. */
export async function buildUserContext(db: PrismaClient, userId: string, now = new Date()): Promise<UserContext | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      preferences: true,
      location: true,
      stamps: { select: { stationId: true } },
      ratings: { select: { placeId: true, score: true }, orderBy: { updatedAt: "desc" }, take: MAX_HISTORY_ITEMS },
      wishlist: { select: { placeId: true }, orderBy: { addedAt: "desc" }, take: MAX_HISTORY_ITEMS },
    },
  });
  if (!user) return null;

  const [checkInCount, lastCheckIn] = await Promise.all([
    db.checkIn.count({ where: { userId } }),
    db.checkIn.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const prefs = user.preferences;
  const shareLocation = prefs?.shareLocation ?? false;
  const loc = user.location;
  const ageMinutes = loc ? (now.getTime() - loc.recordedAt.getTime()) / 60_000 : Infinity;
  const stampedStationIds = user.stamps.map((s) => s.stationId);

  return userContextSchema.parse({
    version: CONTEXT_VERSION,
    subjectId: pseudonymousId("user", user.id),
    kind: "user",
    generatedAt: now.toISOString(),
    preferences: {
      tastes: readTags(prefs?.tastes),
      avoid: readTags(prefs?.avoid),
      dietary: readTags(prefs?.dietary),
      budgetPerPerson: prefs?.defaultBudget ?? null,
      maxWalkMinutes: prefs?.maxWalkMinutes ?? null,
    },
    stations: {
      home: prefs?.homeStationId ?? null,
      start: prefs?.usualStartStationId ?? null,
      homeLines: linesAt(prefs?.homeStationId),
    },
    location:
      shareLocation && loc && ageMinutes <= LOCATION_MAX_AGE_MIN
        ? { nearestStationId: loc.nearestStationId, lat: round3(loc.lat), lng: round3(loc.lng), accuracyM: loc.accuracyM, ageMinutes: Math.round(ageMinutes) }
        : null,
    time: bostonTime(now),
    history: {
      xp: user.xp,
      checkInCount,
      daysSinceLastCheckIn: lastCheckIn ? Math.floor((now.getTime() - lastCheckIn.createdAt.getTime()) / 86_400_000) : null,
      stampedStationIds,
      linesVisited: [...new Set(stampedStationIds.flatMap(linesAt))],
      ratings: user.ratings,
      wishlistPlaceIds: user.wishlist.map((w) => w.placeId),
    },
    consent: { location: shareLocation },
  });
}

/** Minimal shape of a group member's inputs (RoomMember row or planner Member). */
export type MemberInput = {
  id: string;
  startStationId: string;
  homeStationId: string;
  budget: number;
  tastes: unknown;
  avoid: unknown;
  dietary?: unknown;
  maxWalkMinutes?: number | null;
};

/**
 * Context for a room member. Members may not have accounts, so there's no history or
 * live location: just what they typed into the join form. The planner can score a whole
 * group by building one of these per member, without knowing solo vs group mode.
 */
export function memberToContext(m: MemberInput, now = new Date()): UserContext {
  return userContextSchema.parse({
    version: CONTEXT_VERSION,
    subjectId: pseudonymousId("member", m.id),
    kind: "member",
    generatedAt: now.toISOString(),
    preferences: { tastes: readTags(m.tastes), avoid: readTags(m.avoid), dietary: readTags(m.dietary), budgetPerPerson: m.budget, maxWalkMinutes: m.maxWalkMinutes ?? null },
    stations: { home: m.homeStationId, start: m.startStationId, homeLines: linesAt(m.homeStationId) },
    location: null,
    time: bostonTime(now),
    history: { xp: 0, checkInCount: 0, daysSinceLastCheckIn: null, stampedStationIds: [], linesVisited: [], ratings: [], wishlistPlaceIds: [] },
    consent: { location: false },
  });
}
