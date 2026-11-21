// Owner: P4 - Game Layer & Map (see TEAM.md)
// Ratings: a 0-10 score per place. The recommender reads them through UserContext
// (8-10 = like, 0-3 = dislike, 4-6 neutral; src/features/ml/recommend/interactions.ts).
// TODO(P4): Beli-style comparative ratings ("better or worse than X?") can produce this score.
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient;

export const rateSchema = z
  .object({
    placeId: z.string().min(1).max(200),
    score: z.number().min(0).max(10),
    note: z.string().trim().max(280).optional(),
  })
  .strict();
export type RateInput = z.infer<typeof rateSchema>;

export type RatingView = { placeId: string; score: number; note: string | null; updatedAt: string };

const view = (r: { placeId: string; score: number; note: string | null; updatedAt: Date }): RatingView => ({
  placeId: r.placeId,
  score: r.score,
  note: r.note,
  updatedAt: r.updatedAt.toISOString(),
});

/** Rate a place, or change your rating. */
export async function ratePlace(db: Db, userId: string, input: RateInput): Promise<RatingView> {
  const score = Math.round(input.score * 2) / 2; // half points are plenty
  const data = { score, note: input.note ?? null };
  const r = await db.rating.upsert({ where: { userId_placeId: { userId, placeId: input.placeId } }, create: { userId, placeId: input.placeId, ...data }, update: data });
  return view(r);
}

export async function listRatings(db: Db, userId: string, take = 100): Promise<RatingView[]> {
  return (await db.rating.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take })).map(view);
}
