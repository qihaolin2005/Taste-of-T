// Owner: P2 - Data & Integrations (see TEAM.md)
// Trips: record the path someone takes to a restaurant (Strava-style), then show it, alone
// or next to everyone else's path from the same group.
//
// Privacy:
// - Nothing is recorded until the user taps "Start trip" (and allows location).
// - Solo trips are only visible to you. Group trips are visible to members of that group
//   while the group exists (2 days); after that, only to you.
// - Other people never see the first 200 m of your path (it often starts at home).
// - You can delete a trip at any time.
import type { PrismaClient, Trip } from "@/generated/prisma/client";
import type { ApiErrorCode } from "@/lib/api";
import { distanceMeters, type LatLng } from "@/lib/geo";
import { completeQuest } from "@/features/gamification/quests";
import { normalizeCode } from "@/features/rooms/code";
import { appendFixes, hideStart, readPoints, splitLegs, TRIP_RULES, type Leg, type RawFix, type StoredPoint } from "./path";

type Db = PrismaClient;

/** Getting this close to the destination finishes the trip ("Arrived"). */
export const ARRIVE_RADIUS_M = 60;
/** A recording trip with no new point for this long is finished automatically. */
export const TRIP_IDLE_MS = 60 * 60_000;
/** Trips can't run longer than this. */
export const TRIP_MAX_MS = 6 * 60 * 60_000;

export class TripError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type TripPlace = { id: string; name: string | null; lat: number; lng: number };

export type TripView = {
  id: string;
  isYou: boolean;
  /** Who walked it: your name in the group, or null for solo trips. */
  name: string | null;
  roomId: string | null;
  status: "recording" | "finished";
  arrived: boolean;
  place: TripPlace | null;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
  distanceM: number;
  walkM: number;
  transitM: number;
  /** Verified bus/T rides taken during the trip (see src/features/rides). */
  rides: { mode: string | null; routeName: string | null }[];
  legs: Leg[];
  /** true when the start of the path is hidden from you (someone else's trip). */
  startHidden: boolean;
  /** Spin the T quest this trip is for (yours only). */
  questId: string | null;
  /** Set on the response where arriving completed the quest: points added. */
  questAwarded?: number;
};

type RideSummary = { mode: string | null; routeName: string | null; firstMatchAt: Date | null; lastMatchAt: Date | null; userId: string };

function toView(trip: Trip, opts: { viewerId: string; name?: string | null; rides: RideSummary[] }): TripView {
  const isYou = trip.userId === opts.viewerId;
  const all = readPoints(trip.points);
  const points: StoredPoint[] = isYou ? all : hideStart(all);
  const until = trip.endedAt ?? new Date(8.64e15);
  // verified rides that overlap the trip
  const rides = opts.rides.filter(
    (r) => r.userId === trip.userId && r.firstMatchAt && r.lastMatchAt && r.lastMatchAt >= trip.startedAt && r.firstMatchAt <= until,
  );
  const sec = (d: Date) => (d.getTime() - trip.startedAt.getTime()) / 1000;
  const legs = splitLegs(
    points,
    rides.map((r) => ({ fromSec: sec(r.firstMatchAt!), toSec: sec(r.lastMatchAt!), mode: r.mode, routeName: r.routeName })),
  );
  const end = trip.endedAt ?? trip.lastPointAt ?? trip.startedAt;
  return {
    id: trip.id,
    isYou,
    name: opts.name ?? null,
    roomId: trip.roomId,
    status: trip.status as TripView["status"],
    arrived: trip.arrived,
    place: trip.placeLat != null && trip.placeLng != null ? { id: trip.placeId ?? "", name: trip.placeName, lat: trip.placeLat, lng: trip.placeLng } : null,
    startedAt: trip.startedAt.toISOString(),
    endedAt: trip.endedAt?.toISOString() ?? null,
    durationSec: Math.max(0, Math.round((end.getTime() - trip.startedAt.getTime()) / 1000)),
    // Totals use the whole path, even when its start is hidden from the viewer.
    distanceM: Math.round(trip.distanceM),
    walkM: legs.filter((l) => l.mode === "walk").reduce((s, l) => s + l.distanceM, 0),
    transitM: legs.filter((l) => l.mode === "transit").reduce((s, l) => s + l.distanceM, 0),
    rides: rides.map(({ mode, routeName }) => ({ mode, routeName })),
    legs,
    startHidden: !isYou && points.length < all.length,
    questId: isYou ? trip.questId : null,
  };
}

async function ridesFor(db: Db, userIds: string[], since: Date): Promise<RideSummary[]> {
  if (!userIds.length) return [];
  return db.ride.findMany({
    where: { userId: { in: userIds }, status: "verified", lastMatchAt: { gte: since } },
    select: { userId: true, mode: true, routeName: true, firstMatchAt: true, lastMatchAt: true },
    orderBy: { firstMatchAt: "asc" },
  });
}

/** Finish trips that went quiet or ran too long. Returns the (possibly updated) trip. */
async function settle(db: Db, trip: Trip, now: Date): Promise<Trip> {
  if (trip.status !== "recording") return trip;
  const last = trip.lastPointAt ?? trip.startedAt;
  const idle = now.getTime() - last.getTime() > TRIP_IDLE_MS;
  const tooLong = now.getTime() - trip.startedAt.getTime() > TRIP_MAX_MS;
  if (!idle && !tooLong) return trip;
  return db.trip.update({ where: { id: trip.id }, data: { status: "finished", endedAt: last } });
}

/** You're a member of this live (not expired) group. Returns the room code or throws. */
async function requireMembership(db: Db, rawCode: string, userId: string, now: Date) {
  const code = normalizeCode(rawCode);
  const member = code
    ? await db.roomMember.findFirst({ where: { roomId: code, userId, room: { expiresAt: { gt: now } } }, select: { roomId: true, name: true } })
    : null;
  if (!member) throw new TripError("not_found", "Group not found, or you're not in it.");
  return member;
}

export type StartTripInput = { roomId?: string | null; place?: TripPlace | null; questId?: string | null };

/** Start recording. Any other trip you're recording is finished first. */
export async function startTrip(db: Db, userId: string, input: StartTripInput, now = new Date()): Promise<TripView> {
  const roomId = input.roomId ? (await requireMembership(db, input.roomId, userId, now)).roomId : null;
  let questId: string | null = null;
  let place = input.place ?? null;
  if (input.questId) {
    const q = await db.quest.findFirst({ where: { id: input.questId, userId, status: "active" }, select: { id: true, placeId: true, placeName: true, placeLat: true, placeLng: true } });
    if (!q) throw new TripError("not_found", "That quest isn't active anymore. Spin again.");
    // the trip goes to the quest's own place (saved when it was spun)
    if (input.place && q.placeId && q.placeId !== input.place.id) throw new TripError("bad_request", "This trip doesn't go to the quest's restaurant.");
    if (q.placeId && q.placeLat != null && q.placeLng != null) place = { id: q.placeId, name: q.placeName, lat: q.placeLat, lng: q.placeLng };
    if (!place) throw new TripError("bad_request", "Couldn't find where this quest's restaurant is.");
    questId = q.id;
  }
  const trip = await db.$transaction(async (tx) => {
    const open = await tx.trip.findMany({ where: { userId, status: "recording" } });
    for (const t of open) await tx.trip.update({ where: { id: t.id }, data: { status: "finished", endedAt: t.lastPointAt ?? t.startedAt } });
    const p = place;
    return tx.trip.create({
      data: { userId, roomId, questId, startedAt: now, placeId: p?.id ?? null, placeName: p?.name ?? null, placeLat: p?.lat ?? null, placeLng: p?.lng ?? null },
    });
  });
  return toView(trip, { viewerId: userId, rides: [] });
}

async function ownTrip(db: Db, userId: string, tripId: string): Promise<Trip> {
  const trip = await db.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) throw new TripError("not_found", "Trip not found.");
  return trip;
}

/**
 * Add GPS fixes (`t` = epoch ms from the phone) to a trip you're recording. Reaching the
 * destination finishes it.
 */
export async function addPoints(db: Db, userId: string, tripId: string, fixes: readonly (LatLng & { t: number; accuracyM?: number })[], now = new Date()): Promise<TripView> {
  let trip = await settle(db, await ownTrip(db, userId, tripId), now);
  if (trip.status !== "recording") throw new TripError("conflict", "This trip already ended. Start a new one.");

  const start = trip.startedAt.getTime();
  // Phone clocks drift a little; anything from before the trip or the future is dropped.
  const raw: RawFix[] = fixes
    .filter((f) => f.t >= start - 60_000 && f.t <= now.getTime() + 60_000)
    .map((f) => ({ lat: f.lat, lng: f.lng, accuracyM: f.accuracyM, t: (f.t - start) / 1000 }));
  const { points, addedM } = appendFixes(readPoints(trip.points), raw);

  const last = points.at(-1);
  const arrived =
    !!last && trip.placeLat != null && trip.placeLng != null && distanceMeters({ lat: last[0], lng: last[1] }, { lat: trip.placeLat, lng: trip.placeLng }) <= ARRIVE_RADIUS_M;
  const full = points.length >= TRIP_RULES.maxPoints;
  const lastPointAt = last ? new Date(start + last[2] * 1000) : trip.lastPointAt;

  trip = await db.trip.update({
    where: { id: trip.id },
    data: {
      points: points as unknown as object,
      distanceM: trip.distanceM + addedM,
      lastPointAt,
      ...(arrived || full ? { status: "finished", endedAt: lastPointAt ?? now, arrived } : {}),
    },
  });
  const view = toView(trip, { viewerId: userId, rides: await ridesFor(db, [userId], trip.startedAt) });
  if (arrived && trip.questId) view.questAwarded = await completeTripQuest(db, userId, trip, points);
  return view;
}

/** A Spin quest counts only if the trip actually went somewhere: started this far from the place... */
export const QUEST_MIN_START_FROM_PLACE_M = 150;
/** ...and took at least this long. */
export const QUEST_MIN_TRIP_SEC = 60;

/** Arrived on a quest trip: complete the quest (pays its points once). Returns points added now. */
async function completeTripQuest(db: Db, userId: string, trip: Trip, points: StoredPoint[]): Promise<number> {
  const first = points[0];
  const last = points.at(-1)!;
  const traveled =
    distanceMeters({ lat: first[0], lng: first[1] }, { lat: trip.placeLat!, lng: trip.placeLng! }) >= QUEST_MIN_START_FROM_PLACE_M && last[2] >= QUEST_MIN_TRIP_SEC;
  if (!traveled) return 0;
  try {
    return (await completeQuest(db, userId, trip.questId!)).awarded;
  } catch {
    return 0; // quest gone or abandoned (spun again): the trip still counts as a trip
  }
}

/** Tapping "I'm here" this close to the destination counts as arriving (GPS indoors drifts). */
export const MANUAL_ARRIVE_RADIUS_M = 150;

export async function finishTrip(db: Db, userId: string, tripId: string, now = new Date()): Promise<TripView> {
  let trip = await settle(db, await ownTrip(db, userId, tripId), now);
  let justArrived = false;
  const points = readPoints(trip.points);
  if (trip.status === "recording") {
    const last = points.at(-1);
    justArrived =
      !!last && trip.placeLat != null && trip.placeLng != null && distanceMeters({ lat: last[0], lng: last[1] }, { lat: trip.placeLat, lng: trip.placeLng }) <= MANUAL_ARRIVE_RADIUS_M;
    trip = await db.trip.update({ where: { id: trip.id }, data: { status: "finished", endedAt: now, arrived: justArrived } });
  }
  const view = toView(trip, { viewerId: userId, rides: await ridesFor(db, [userId], trip.startedAt) });
  if (justArrived && trip.questId) view.questAwarded = await completeTripQuest(db, userId, trip, points);
  return view;
}

export async function deleteTrip(db: Db, userId: string, tripId: string): Promise<void> {
  const { count } = await db.trip.deleteMany({ where: { id: tripId, userId } });
  if (!count) throw new TripError("not_found", "Trip not found.");
}

/** Your trips, newest first. */
export async function listMyTrips(db: Db, userId: string, now = new Date(), take = 20): Promise<TripView[]> {
  const rows = await db.trip.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take });
  const trips = await Promise.all(rows.map((t) => settle(db, t, now)));
  const rides = trips.length ? await ridesFor(db, [userId], trips.at(-1)!.startedAt) : [];
  return trips.map((t) => toView(t, { viewerId: userId, rides }));
}

/** One trip: yours, or a group-mate's while you're both in the (live) group. */
export async function getTrip(db: Db, viewerId: string, tripId: string, now = new Date()): Promise<TripView> {
  const found = await db.trip.findUnique({ where: { id: tripId } });
  if (!found) throw new TripError("not_found", "Trip not found.");
  let name: string | null = null;
  if (found.userId !== viewerId) {
    if (!found.roomId) throw new TripError("not_found", "Trip not found.");
    await requireMembership(db, found.roomId, viewerId, now).catch(() => {
      throw new TripError("not_found", "Trip not found.");
    });
    name = (await db.roomMember.findFirst({ where: { roomId: found.roomId, userId: found.userId }, select: { name: true } }))?.name ?? "Group member";
  }
  const trip = await settle(db, found, now);
  return toView(trip, { viewerId, name, rides: await ridesFor(db, [trip.userId], trip.startedAt) });
}

export type GroupTrips = { roomId: string; trips: TripView[]; destination: TripPlace | null };

/**
 * Everyone's latest trip in a group, for the shared map. Only members of the group can see
 * it, and only members who are still in it are shown.
 */
export async function listRoomTrips(db: Db, viewerId: string, rawCode: string, now = new Date()): Promise<GroupTrips> {
  const { roomId } = await requireMembership(db, rawCode, viewerId, now);
  const members = await db.roomMember.findMany({ where: { roomId, userId: { not: null } }, select: { userId: true, name: true } });
  const nameOf = new Map(members.map((m) => [m.userId!, m.name]));
  const rows = await db.trip.findMany({ where: { roomId, userId: { in: [...nameOf.keys()] } }, orderBy: { startedAt: "desc" } });
  // latest trip per person
  const latest = [...new Map(rows.reverse().map((t) => [t.userId, t])).values()];
  const trips = await Promise.all(latest.map((t) => settle(db, t, now)));
  const since = trips.reduce<Date>((min, t) => (t.startedAt < min ? t.startedAt : min), now);
  const rides = await ridesFor(db, trips.map((t) => t.userId), since);
  const views = trips
    .map((t) => toView(t, { viewerId, name: nameOf.get(t.userId) ?? null, rides }))
    // you first, then by start time
    .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.startedAt.localeCompare(b.startedAt));
  return { roomId, trips: views, destination: views.find((v) => v.place)?.place ?? null };
}
