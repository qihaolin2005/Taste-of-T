// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Swipe history: the user's right/left swipes (solo and from squad sessions), read and written
// as the recommenders' Swipe type. Ratings, wishlist, and check-ins come in via UserContext.
import type { PrismaClient } from "@/generated/prisma/client";
import type { Swipe } from "./recommend/interactions";

/** A user's swipes (solo and group), most recent first. */
export async function loadUserSwipes(db: PrismaClient, userId: string, take = 200): Promise<Swipe[]> {
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
export async function recordSoloSwipe(db: PrismaClient, userId: string, placeId: string, liked: boolean) {
  const existing = await db.swipe.findFirst({ where: { userId, placeId, roomId: null }, select: { id: true } });
  if (existing) return db.swipe.update({ where: { id: existing.id }, data: { liked } });
  return db.swipe.create({ data: { userId, placeId, liked, source: "solo" } });
}
