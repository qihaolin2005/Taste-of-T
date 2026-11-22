// Owner: P4 - Game Layer & Map (see TEAM.md)
// "Trending right now" under the T map: places people in the app are into this week.
//
//   buzz  = likes in group swipes + 4 x verified visits (reward claims) + 2 x ratings of 8+/10,
//           all in the last 7 days. Visits count most: someone actually went.
//   popularity = Google rating weighted by review count, so the list isn't empty before the app
//           has activity (and breaks ties). Buzz always outranks popularity.
//
// rankTrending() is pure and tested; trendingPlaces() adds the database queries.
import type { PrismaClient } from "@/generated/prisma/client";
import type { RestaurantCandidate } from "@/features/ml";

export const TRENDING_CONFIG = {
  windowDays: 7,
  weights: { like: 1, visit: 4, loved: 2 },
  /** A rating this high (0-10) counts as "loved". */
  lovedScore: 8,
  limit: 8,
};

export type Buzz = { likes: number; visits: number; loved: number };

export type TrendingPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  neighborhood: string | null;
  cuisines: string[];
  rating: number | null;
  priceLevel: number | null;
  /** Why it's here: "5 likes · 2 visits this week", or "★ 4.7 · 2.3k reviews". */
  why: string;
  /** True when it's here because of activity in the app, not just Google ratings. */
  buzzing: boolean;
};

const buzzScore = (b: Buzz | undefined, cfg = TRENDING_CONFIG) => (b ? b.likes * cfg.weights.like + b.visits * cfg.weights.visit + b.loved * cfg.weights.loved : 0);

/** Rating pulled toward 4.0 when there are few reviews, times how many people reviewed it. */
function popularity(p: RestaurantCandidate): number {
  if (p.rating == null) return 0;
  const n = p.reviewCount ?? 0;
  const adjusted = (p.rating * n + 4 * 50) / (n + 50);
  return adjusted * Math.log10(n + 10);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

function why(p: RestaurantCandidate, b: Buzz | undefined): string {
  if (b && buzzScore(b) > 0) {
    const parts = [b.likes ? plural(b.likes, "like") : null, b.visits ? plural(b.visits, "visit") : null, b.loved ? `${b.loved} loved it` : null].filter(Boolean);
    return `${parts.join(" · ")} this week`;
  }
  return [p.rating != null ? `★ ${p.rating.toFixed(1)}` : null, p.reviewCount ? `${compact(p.reviewCount)} reviews` : null].filter(Boolean).join(" · ") || "Popular nearby";
}

/** Restaurants (not activities) with a map position, most buzz first, then most popular. */
export function rankTrending(places: readonly RestaurantCandidate[], buzz: ReadonlyMap<string, Buzz>, limit = TRENDING_CONFIG.limit): TrendingPlace[] {
  return places
    .filter((p): p is RestaurantCandidate & { name: string; lat: number; lng: number } => p.category !== "activity" && !!p.name && typeof p.lat === "number" && typeof p.lng === "number")
    .map((p) => ({ p, b: buzz.get(p.id), s: buzzScore(buzz.get(p.id)), pop: popularity(p) }))
    .sort((x, y) => y.s - x.s || y.pop - x.pop || x.p.name.localeCompare(y.p.name))
    .slice(0, limit)
    .map(({ p, b, s }) => ({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      neighborhood: p.neighborhood ?? null,
      cuisines: (p.cuisines ?? p.tags ?? []).slice(0, 3),
      rating: p.rating ?? null,
      priceLevel: p.priceLevel ?? null,
      why: why(p, b),
      buzzing: s > 0,
    }));
}

/** Activity per place in the window: likes, distinct visitors who claimed a meal, 8+ ratings. */
export async function recentBuzz(db: PrismaClient, now = new Date(), cfg = TRENDING_CONFIG): Promise<Map<string, Buzz>> {
  const since = new Date(now.getTime() - cfg.windowDays * 86_400_000);
  const [likes, visits, loved] = await Promise.all([
    db.swipe.groupBy({ by: ["placeId"], where: { liked: true, updatedAt: { gte: since } }, _count: { _all: true } }),
    db.rewardVisit.groupBy({ by: ["placeId", "userId"], where: { createdAt: { gte: since } } }),
    db.rating.groupBy({ by: ["placeId"], where: { score: { gte: cfg.lovedScore }, updatedAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const out = new Map<string, Buzz>();
  const get = (id: string) => out.get(id) ?? out.set(id, { likes: 0, visits: 0, loved: 0 }).get(id)!;
  for (const r of likes) get(r.placeId).likes = r._count._all;
  for (const r of visits) get(r.placeId).visits += 1; // one row per (place, person)
  for (const r of loved) get(r.placeId).loved = r._count._all;
  return out;
}

export async function trendingPlaces(db: PrismaClient, places: readonly RestaurantCandidate[], now = new Date()): Promise<TrendingPlace[]> {
  return rankTrending(places, await recentBuzz(db, now));
}
