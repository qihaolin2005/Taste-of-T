// Owner: P4 - Game Layer & Map (see TEAM.md)
// Wishlist add/remove/list. A wishlisted place counts as a weak "like" for the recommender.
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient;

export const wishlistSchema = z.object({ placeId: z.string().min(1).max(200) }).strict();

export type WishlistView = { placeId: string; addedAt: string };

export async function addToWishlist(db: Db, userId: string, placeId: string): Promise<WishlistView> {
  const w = await db.wishlistItem.upsert({ where: { userId_placeId: { userId, placeId } }, create: { userId, placeId }, update: {} });
  return { placeId: w.placeId, addedAt: w.addedAt.toISOString() };
}

export async function removeFromWishlist(db: Db, userId: string, placeId: string): Promise<void> {
  await db.wishlistItem.deleteMany({ where: { userId, placeId } });
}

export async function listWishlist(db: Db, userId: string, take = 100): Promise<WishlistView[]> {
  const rows = await db.wishlistItem.findMany({ where: { userId }, orderBy: { addedAt: "desc" }, take });
  return rows.map((w) => ({ placeId: w.placeId, addedAt: w.addedAt.toISOString() }));
}
