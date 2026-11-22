// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// Claiming a restaurant visit: check it, work out the points, add them to User.xp.
//
//   claimVisit(db, userId, { placeId, receipt, travel })
//     1. the place was recommended to you in the last 48 h (your "for you" list or a squad's top 5)
//     2. the receipt is plausible: recent, not in the future, from this restaurant, not reused
//     3. limits: once per place per day, 2 rewarded visits per day
//     4. points = (meal + spend + travel + first visit) x repeat factor x group multiplier
//     5. squad visits: when more squad-mates eat at the same place, everyone's group bonus is
//        topped up (the first person to claim isn't penalized for being first)
//
// Points go through awardPointsTx (src/features/gamification), so every award is a PointsEvent
// row ("restaurant_visit", then "group_bonus" top-ups) and shows in the points history.
//
// The receipt is passed in already read (total, date, merchant name). Reading the photo (OCR) and
// detecting bus vs T happen elsewhere; only their results reach this code, and no photo or GPS
// trace is stored.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import type { LatLng } from "@/lib/geo";
import { awardPointsTx } from "@/features/gamification";
import { checkRideForReward } from "@/features/rides";
import { REWARDS_CONFIG, type RewardsConfig } from "./config";
import { basePoints, groupMultiplier, withGroup, type PointsBreakdown, type TravelMode } from "./points";

type Db = PrismaClient;

const L = REWARDS_CONFIG.limits;

export const claimVisitSchema = z
  .object({
    placeId: z.string().min(1).max(100),
    receipt: z
      .object({
        /** Receipt total in USD (including tax and tip if shown). */
        total: z.number().positive().max(L.maxReceiptUsd),
        /** When the receipt was printed, ISO 8601, e.g. "2026-11-21T19:42:00-05:00". */
        date: z.string().datetime({ offset: true }),
        /** Restaurant name printed on the receipt, if read. Checked against the place's name. */
        merchantName: z.string().trim().min(1).max(120).optional(),
        /** How many people the bill covers. Spend points use the per-person share. Default 1. */
        diners: z.number().int().min(1).max(L.maxDinersOnReceipt).optional(),
        /** Receipt/check number, if read. Makes duplicate detection exact. */
        receiptNumber: z.string().trim().min(1).max(60).optional(),
      })
      .strict(),
    /**
     * A ride verified against live MBTA data (POST /api/rides/ping, src/features/rides).
     * The server looks up its mode (bus or T); the client can't just claim one.
     */
    travel: z.object({ rideId: z.string().min(1).max(40) }).strict().optional(),
  })
  .strict();
export type ClaimVisitInput = z.infer<typeof claimVisitSchema>;

export type RewardErrorCode = "bad_request" | "forbidden" | "conflict" | "too_many_requests";

export class RewardError extends Error {
  constructor(
    public code: RewardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RewardError";
  }
}

const fail = (code: RewardErrorCode, message: string): never => {
  throw new RewardError(code, message);
};

/** "YYYY-MM-DD" in Boston. */
export function bostonDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

const HOUR = 3_600_000;

// ------------------------------------------------------------- checks

const STOPWORDS = new Set(["the", "and", "restaurant", "kitchen", "cafe", "bar", "grill", "house", "llc", "inc", "co"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

/** Receipt merchant names are abbreviated ("LANTERN DUMPLING HSE #2"), so one shared word is enough. */
export function merchantMatches(receiptName: string, placeName: string): boolean {
  const a = new Set(words(receiptName));
  return words(placeName).some((w) => a.has(w) || [...a].some((x) => x.length >= 4 && (w.startsWith(x) || x.startsWith(w))));
}

function receiptKey(placeId: string, r: ClaimVisitInput["receipt"]): string {
  const id = r.receiptNumber
    ? `n:${r.receiptNumber.toLowerCase()}`
    : `t:${r.total.toFixed(2)}|${new Date(r.date).toISOString().slice(0, 16)}`; // to the minute
  return createHash("sha256").update(`${placeId}|${id}`).digest("base64url").slice(0, 32);
}

type Recommended = { via: "for-you" } | { via: "squad"; roomId: string };

/** Was this place recommended to the user recently? A squad's top 5 wins (it unlocks the group bonus). */
async function findRecommendation(db: Db, userId: string, placeId: string, now: Date, cfg: RewardsConfig): Promise<Recommended | null> {
  const since = new Date(now.getTime() - cfg.limits.recommendedWithinHours * HOUR);
  const [memberships, swipedRooms] = await Promise.all([
    db.roomMember.findMany({ where: { userId }, select: { roomId: true } }),
    db.swipe.findMany({ where: { userId, roomId: { not: null } }, select: { roomId: true }, distinct: ["roomId"] }),
  ]);
  const roomIds = [...new Set([...memberships.map((m) => m.roomId), ...swipedRooms.map((s) => s.roomId!)])];
  if (roomIds.length) {
    const plans = await db.plan.findMany({ where: { roomId: { in: roomIds }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
    for (const p of plans) {
      const picks = (p.result as { picks?: { place?: { id?: string } }[] } | null)?.picks ?? [];
      if (p.roomId && picks.some((x) => x.place?.id === placeId)) return { via: "squad", roomId: p.roomId };
    }
  }
  const shown = await db.recommendationShown.findUnique({ where: { userId_placeId: { userId, placeId } } });
  return shown && shown.shownAt >= since ? { via: "for-you" } : null;
}

export type ClaimablePlace = { placeId: string; name: string | null; via: Recommended["via"]; at: string };

/**
 * Places the user could claim points for right now: recommended to them within the window, from
 * a squad's top 5 (first, newest plan first) or their "for you" / Spin results. Names come from
 * the squad plan; for "for you" places the caller looks them up (they're null here).
 */
export async function listClaimablePlaces(db: Db, userId: string, opts: { now?: Date; config?: RewardsConfig } = {}): Promise<ClaimablePlace[]> {
  const cfg = opts.config ?? REWARDS_CONFIG;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - cfg.limits.recommendedWithinHours * HOUR);
  const out = new Map<string, ClaimablePlace>();
  const [memberships, swipedRooms] = await Promise.all([
    db.roomMember.findMany({ where: { userId }, select: { roomId: true } }),
    db.swipe.findMany({ where: { userId, roomId: { not: null } }, select: { roomId: true }, distinct: ["roomId"] }),
  ]);
  const roomIds = [...new Set([...memberships.map((m) => m.roomId), ...swipedRooms.map((x) => x.roomId!)])];
  if (roomIds.length) {
    const plans = await db.plan.findMany({ where: { roomId: { in: roomIds }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
    for (const p of plans) {
      const picks = (p.result as { picks?: { place?: { id?: string; name?: string } }[] } | null)?.picks ?? [];
      for (const pick of picks) {
        const id = pick.place?.id;
        if (id && !out.has(id)) out.set(id, { placeId: id, name: pick.place?.name ?? null, via: "squad", at: p.createdAt.toISOString() });
      }
    }
  }
  const shown = await db.recommendationShown.findMany({ where: { userId, shownAt: { gte: since } }, orderBy: { shownAt: "desc" }, take: 30 });
  for (const r of shown) if (!out.has(r.placeId)) out.set(r.placeId, { placeId: r.placeId, name: null, via: "for-you", at: r.shownAt.toISOString() });
  // Places already rewarded today can't be claimed again today (limits.perPlacePerDay).
  const claimedToday = await db.rewardVisit.findMany({ where: { userId, day: bostonDay(now) }, select: { placeId: true } });
  for (const c of claimedToday) out.delete(c.placeId);
  return [...out.values()];
}

/** How many more rewarded visits the user can claim today (limits.visitsPerDay). */
export async function visitsLeftToday(db: Db, userId: string, opts: { now?: Date; config?: RewardsConfig } = {}): Promise<number> {
  const cfg = opts.config ?? REWARDS_CONFIG;
  const used = await db.rewardVisit.count({ where: { userId, day: bostonDay(opts.now ?? new Date()) } });
  return Math.max(0, cfg.limits.visitsPerDay - used);
}

// ------------------------------------------------------------- claim

export type ClaimResult = {
  visitId: string;
  /** Points added to your total for this visit so far (can grow as squad-mates check in). */
  points: number;
  breakdown: PointsBreakdown;
  groupMultiplier: number;
  /** Squad members (including you) who've claimed this place within the group window. */
  groupSize: number;
  recommendedVia: Recommended["via"];
  /** Your new XP total. */
  xp: number;
  /** Set when a ride was sent but couldn't earn travel points, and why. */
  travelNote?: string;
};

export async function claimVisit(
  db: Db,
  userId: string,
  input: ClaimVisitInput,
  opts: { now?: Date; placeName?: string | null; placeCoords?: LatLng | null; config?: RewardsConfig } = {},
): Promise<ClaimResult> {
  const cfg = opts.config ?? REWARDS_CONFIG;
  const now = opts.now ?? new Date();
  const day = bostonDay(now);
  const { placeId, receipt } = input;

  // 1. Recommended?
  const rec = (await findRecommendation(db, userId, placeId, now, cfg)) ?? fail("forbidden", "Points are for places we recommended to you in the last 48 hours.");

  // 2. Receipt
  const printed = new Date(receipt.date);
  if (printed.getTime() > now.getTime() + 10 * 60_000) fail("bad_request", "The receipt date is in the future.");
  if (now.getTime() - printed.getTime() > cfg.limits.receiptMaxAgeHours * HOUR) fail("bad_request", `Receipts must be from the last ${cfg.limits.receiptMaxAgeHours} hours.`);
  if (receipt.merchantName && opts.placeName && !merchantMatches(receipt.merchantName, opts.placeName)) {
    fail("bad_request", `This receipt doesn't look like it's from ${opts.placeName}.`);
  }
  const diners = receipt.diners ?? 1;
  const key = receiptKey(placeId, receipt);
  const claimsOnReceipt = await db.rewardVisit.findMany({ where: { receiptKey: key }, select: { userId: true, dinersOnReceipt: true } });
  if (claimsOnReceipt.some((c) => c.userId === userId)) fail("conflict", "You've already claimed this receipt.");
  const allowed = Math.max(diners, ...claimsOnReceipt.map((c) => c.dinersOnReceipt));
  if (claimsOnReceipt.length >= allowed) fail("conflict", "Everyone on this receipt has already claimed it.");

  // 3. Limits
  const [samePlaceToday, visitsToday, previousVisits] = await Promise.all([
    db.rewardVisit.count({ where: { userId, placeId, day } }),
    db.rewardVisit.count({ where: { userId, day } }),
    db.rewardVisit.count({ where: { userId, placeId } }),
  ]);
  if (samePlaceToday >= cfg.limits.perPlacePerDay) fail("conflict", "You've already earned points here today.");
  if (visitsToday >= cfg.limits.visitsPerDay) fail("too_many_requests", `That's ${cfg.limits.visitsPerDay} rewarded visits today. Come back tomorrow!`);

  // 4. Travel: only a ride verified against live MBTA data, ending near this place, unused.
  let travelMode: TravelMode = "none";
  let rideId: string | null = null;
  let travelNote: string | undefined;
  if (input.travel) {
    const check = await checkRideForReward(db, userId, input.travel.rideId, { now, place: opts.placeCoords });
    if ("ride" in check) {
      travelMode = check.ride.mode;
      rideId = check.ride.id;
    } else travelNote = check.reason;
  }

  // Points before the group bonus
  const breakdown = basePoints({ receiptTotal: receipt.total, dinersOnReceipt: diners, travelMode, previousVisits }, cfg);
  const roomId = rec.via === "squad" ? rec.roomId : null;

  // 5. Store, then (for squads) recompute everyone's group bonus. One transaction, so totals stay right.
  try {
    return await db.$transaction(async (tx) => {
      const visit = await tx.rewardVisit.create({
        data: {
          userId,
          placeId,
          placeName: opts.placeName ?? null,
          roomId,
          day,
          receiptTotal: receipt.total,
          dinersOnReceipt: diners,
          receiptDate: printed.toISOString(),
          receiptKey: key,
          travelMode,
          rideId,
          basePoints: breakdown.base,
          groupMultiplier: 1,
          pointsAwarded: 0,
          breakdown,
          createdAt: now, // the claim time; the group window is measured from the same clock
        },
      });

      const group = roomId
        ? await tx.rewardVisit.findMany({
            where: { roomId, placeId, createdAt: { gte: new Date(now.getTime() - cfg.group.windowHours * HOUR) } },
            orderBy: { createdAt: "asc" },
          })
        : [visit];
      const people = new Set(group.map((v) => v.userId)).size;
      const multiplier = groupMultiplier(people, cfg);

      let mine = 0;
      for (const v of group) {
        // Points already earned never go down (the window can drop people who claimed long ago).
        const m = Math.max(multiplier, v.groupMultiplier);
        const target = Math.max(withGroup(v.basePoints, m), v.pointsAwarded);
        const delta = target - v.pointsAwarded;
        if (v.id === visit.id) mine = target;
        if (delta <= 0) continue;
        await tx.rewardVisit.update({ where: { id: v.id }, data: { pointsAwarded: target, groupMultiplier: m } });
        await awardPointsTx(tx, v.userId, delta, v.id === visit.id ? "restaurant_visit" : "group_bonus", undefined, v.id);
      }
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } });
      return {
        visitId: visit.id,
        points: mine,
        breakdown,
        groupMultiplier: multiplier,
        groupSize: people,
        recommendedVia: rec.via,
        xp: user.xp,
        ...(travelNote ? { travelNote } : {}),
      };
    });
  } catch (err) {
    // Two claims at the same moment: a unique index wins (same receipt, or the same ride).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String((err.meta as { target?: unknown } | undefined)?.target ?? "");
      fail("conflict", target.includes("rideId") ? "That ride already earned travel points for another visit." : "You've already claimed this receipt.");
    }
    throw err;
  }
}

// ------------------------------------------------------------- history

export type RewardSummary = {
  xp: number;
  visits: { id: string; placeId: string; day: string; points: number; groupMultiplier: number; travelMode: string; breakdown: PointsBreakdown; createdAt: string }[];
};

export async function getRewards(db: Db, userId: string, take = 20): Promise<RewardSummary | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { xp: true } });
  if (!user) return null;
  const rows = await db.rewardVisit.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
  return {
    xp: user.xp,
    visits: rows.map((v) => ({
      id: v.id,
      placeId: v.placeId,
      day: v.day,
      points: v.pointsAwarded,
      groupMultiplier: v.groupMultiplier,
      travelMode: v.travelMode,
      breakdown: v.breakdown as PointsBreakdown,
      createdAt: v.createdAt.toISOString(),
    })),
  };
}
