// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Turns what we know about a person into signed, recency-weighted interactions per place.
// Today there is no swipe data, so preference comes from the UserContext history:
//   ratings (0-10: high = like, low = dislike), wishlist (weak like), check-ins (weak like).
// Swipes (solo or from a group session) plug in through the same function.
import type { UserContext } from "../context";
import { RECOMMENDER_CONFIG, type RecommenderConfig } from "./config";

export type SwipeSource = "solo" | "group";

/** One right/left swipe. Nothing stores these yet; see docs/ml-schema-proposal.md. */
export type Swipe = {
  placeId: string;
  liked: boolean;
  source: SwipeSource;
  /** Epoch ms. Used only to order swipes by recency; missing = keep the given order. */
  at?: number;
  /** Group session id, when source is "group". */
  sessionId?: string;
};

/** Net preference for one place. weight is signed: > 0 like, < 0 dislike. */
export type Interaction = { placeId: string; weight: number; kinds: InteractionKind[] };
export type InteractionKind = "swipe-like" | "swipe-dislike" | "rated-high" | "rated-low" | "wishlist" | "checked-in";

const decay = (rank: number, halfLife: number) => Math.pow(0.5, rank / halfLife);

/**
 * Lists are assumed most-recent-first (that's how buildUserContext orders them).
 * Per place: strong signals (swipes, ratings) add up; weak ones (wishlist, check-in) add up to
 * `weakCap` and only count when there is no strong signal for that place.
 */
export function deriveInteractions(ctx: UserContext, swipes: readonly Swipe[] = [], cfg: RecommenderConfig = RECOMMENDER_CONFIG): Interaction[] {
  const s = cfg.signals;
  const strong = new Map<string, { w: number; kinds: Set<InteractionKind> }>();
  const weak = new Map<string, { w: number; kinds: Set<InteractionKind> }>();
  const add = (m: typeof strong, id: string, w: number, kind: InteractionKind) => {
    const e = m.get(id) ?? { w: 0, kinds: new Set<InteractionKind>() };
    e.w += w;
    e.kinds.add(kind);
    m.set(id, e);
  };

  const orderedSwipes = swipes.some((x) => x.at != null) ? [...swipes].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)) : swipes;
  orderedSwipes.forEach((sw, rank) => {
    const base = sw.liked ? s.swipeLike : s.swipeDislike;
    const factor = sw.source === "group" ? s.groupSwipeFactor : 1;
    add(strong, sw.placeId, base * factor * decay(rank, cfg.recencyHalfLife), sw.liked ? "swipe-like" : "swipe-dislike");
  });

  ctx.history.ratings.forEach((r, rank) => {
    const w = (r.score - 5) / 5;
    if (Math.abs(w) < s.ratingNeutralBand) return;
    add(strong, r.placeId, w * decay(rank, cfg.recencyHalfLife), w > 0 ? "rated-high" : "rated-low");
  });

  ctx.history.wishlistPlaceIds.forEach((id, rank) => add(weak, id, s.wishlist * decay(rank, cfg.recencyHalfLife), "wishlist"));
  ctx.history.checkInPlaceIds.forEach((id, rank) => add(weak, id, s.checkIn * decay(rank, cfg.recencyHalfLife), "checked-in"));

  const out: Interaction[] = [];
  for (const [placeId, e] of strong) out.push({ placeId, weight: e.w, kinds: [...e.kinds] });
  for (const [placeId, e] of weak) {
    if (strong.has(placeId)) continue;
    out.push({ placeId, weight: Math.min(s.weakCap, e.w), kinds: [...e.kinds] });
  }
  return out;
}

/** Convert one member's swipes from a group session into Swipe records for their own history. */
export function groupSwipesToHistory(votes: readonly { placeId: string; liked: boolean; at?: number }[], sessionId: string): Swipe[] {
  return votes.map((v) => ({ placeId: v.placeId, liked: v.liked, source: "group", sessionId, at: v.at }));
}
