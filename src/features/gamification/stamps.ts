// Owner: P4 - Game Layer & Map (see TEAM.md)
// Station stamp unlocks.
// TODO(P4): award stamps from check-ins (POST /api/checkin) via awardStamp().
import type { PrismaClient } from "@/generated/prisma/client";

export type StampInfo = { stationId: string; earnedAt: string };

export async function getStamps(db: PrismaClient, userId: string): Promise<StampInfo[]> {
  const rows = await db.stamp.findMany({ where: { userId }, orderBy: { earnedAt: "asc" } });
  return rows.map((r) => ({ stationId: r.stationId, earnedAt: r.earnedAt.toISOString() }));
}

/** Idempotent: returns true only the first time a station is stamped. */
export async function awardStamp(db: PrismaClient, userId: string, stationId: string): Promise<boolean> {
  const existing = await db.stamp.findUnique({ where: { userId_stationId: { userId, stationId } } });
  if (existing) return false;
  await db.stamp.create({ data: { userId, stationId } });
  return true;
}
