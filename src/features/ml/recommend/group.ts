// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Recommender 2: a group session. Two steps:
//
// buildGroupDeck(members, places)
//   kind of place (the room's stop) -> city area (Boston + Cambridge + Somerville = one area)
//   -> strict dietary filter on the UNION of everyone's restrictions
//   -> score every place for every member with the individual model (no distance: groups have no radius)
//   -> group score = 0.6 * mean + 0.4 * min, with a "hate" veto  [config.ts: group.*]
//   -> deck of ~18: MMR for cuisine variety + a few lower-confidence "explore" picks
//
// rankAfterSwipes(deck, votes, memberIds)
//   like ratio among members who swiped -> unanimous bonus -> pre-swipe group score -> rating
//   -> top 5; if fewer than 5 got likes, fill with unvoted places by group score, marked "not-voted".
//
// Why 0.6 * average + 0.4 * least-misery:
//   - Average alone lets a majority outvote someone who'd hate the place.
//   - Least misery alone (only the minimum) picks safe, bland places nobody minds and nobody loves,
//     and one picky member decides everything.
//   - The blend rewards places most people like, while the 0.4 on the minimum keeps the unhappiest
//     member's score in play.
//   - On top, a veto removes anything a member would hate. A member "hates" a place when ANY of:
//       * their blended score is below `hateThreshold`,
//       * they explicitly disliked that place (net weight <= excludeDislikedAt; score set to 0),
//       * it has one of their "avoid" tags (score set to 0),
//       * their taste similarity is below `hateSimilarity` and their confidence is at least
//         `hateMinConfidence` (e.g. they rated two thai places 0/10 -> other thai places).
//     The taste rule exists because the blended score mixes in rating quality, which is shared by
//     everyone, so a well-rated place someone clearly dislikes would otherwise never drop below the
//     threshold. If the veto would leave fewer than `minAfterVeto` places, it's dropped and the
//     result says so.
import type { UserContext } from "../context";
import { RECOMMENDER_CONFIG, type RecommenderConfig } from "./config";
import { dietaryHighlights, filterByDietary, unionDietary } from "./dietary";
import { groupSwipesToHistory, type Swipe } from "./interactions";
import { mmrRerank, profileUser, scorePlace, type ProfiledUser } from "./individual";
import { cuisinesOf, type RestaurantCandidate } from "./restaurant";
import { tasteTagsOf } from "./vectors";

export type GroupMember = {
  /** Stable member id within the session (RoomMember.id). */
  id: string;
  ctx: UserContext;
  /** Where the member lives. Not stored anywhere yet; see docs/ml-schema-proposal.md. */
  city?: string;
  /** Past swipes for this member, if any. */
  swipes?: readonly Swipe[];
};

export type HateReason = "low-score" | "disliked" | "avoid-tag" | "taste";
export type MemberScore = { memberId: string; score: number; confidence: number; similarity: number; hates: HateReason | null };

export type GroupCandidate = {
  place: RestaurantCandidate;
  groupScore: number;
  mean: number;
  min: number;
  memberScores: MemberScore[];
  /** 0-1: how little we know about how the group feels about this place. */
  uncertainty: number;
  vetoed: boolean;
};

export type DeckItem = GroupCandidate & { explore: boolean; reason: string };

export type GroupDeck = {
  deck: DeckItem[];
  /** Every eligible place (dietary-safe, not vetoed unless the veto was dropped), best first. */
  ranked: GroupCandidate[];
  city: string | null;
  dietary: string[];
  vetoDropped: boolean;
  counts: { input: number; otherCategory: number; outOfCity: number; dietary: number; vetoed: number };
  warnings: string[];
};

export type GroupVote = { memberId: string; placeId: string; liked: boolean; at?: number };

export type GroupPickStatus = "liked" | "not-voted" | "no-likes";

export type GroupPick = {
  rank: number;
  place: RestaurantCandidate;
  status: GroupPickStatus;
  likes: number;
  dislikes: number;
  /** Members who swiped on this place. */
  swiped: number;
  /** likes / swiped, or null when nobody swiped. */
  likeRatio: number | null;
  /** Every member of the group swiped right. */
  unanimous: boolean;
  groupScore: number;
};

export type GroupRanking = { picks: GroupPick[]; filled: number; warnings: string[] };

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const norm = (s: string) => s.trim().toLowerCase();

// ------------------------------------------------------------- deck

/** The metro area a city belongs to (config.metroAreas), or the city itself. Case-insensitive. */
export function areaOf(city: string, cfg: RecommenderConfig = RECOMMENDER_CONFIG): string {
  const c = norm(city);
  for (const [area, cities] of Object.entries(cfg.metroAreas)) if (cities.includes(c)) return area;
  return c;
}

function resolveCity(members: readonly GroupMember[], override?: string): string | null {
  if (override) return override;
  const counts = new Map<string, { n: number; label: string }>();
  for (const m of members) {
    if (!m.city) continue;
    const k = norm(m.city);
    counts.set(k, { n: (counts.get(k)?.n ?? 0) + 1, label: counts.get(k)?.label ?? m.city.trim() });
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))[0];
  return top?.label ?? null;
}

function avoids(m: ProfiledUser, p: RestaurantCandidate): boolean {
  const avoid = new Set(m.ctx.preferences.avoid.map(norm));
  return avoid.size > 0 && [...cuisinesOf(p), ...p.tags.map(norm)].some((t) => avoid.has(t));
}

export function scoreForGroup(members: readonly ProfiledUser[], memberIds: readonly string[], place: RestaurantCandidate, cfg: RecommenderConfig = RECOMMENDER_CONFIG): GroupCandidate {
  const g = cfg.group;
  const memberScores: MemberScore[] = members.map((m, i) => {
    const { score, components: c } = scorePlace(m, place, null, cfg);
    const disliked = (m.profile.disliked.get(place.id) ?? 0) <= cfg.excludeDislikedAt;
    const avoided = avoids(m, place);
    const hates: HateReason | null = disliked
      ? "disliked"
      : avoided
        ? "avoid-tag"
        : c.confidence >= g.hateMinConfidence && c.similarity < g.hateSimilarity
          ? "taste"
          : score < g.hateThreshold
            ? "low-score"
            : null;
    // Explicit no's (disliked this place, avoid tag) zero the member's score so they also drag the min down.
    return { memberId: memberIds[i], score: disliked || avoided ? 0 : score, confidence: c.confidence, similarity: c.similarity, hates };
  });
  const scores = memberScores.map((s) => s.score);
  const mean = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
  const min = scores.length ? Math.min(...scores) : 0;
  const totalW = g.avgWeight + g.minWeight;
  // Uncertainty per member: 1 with no evidence; lower when they're confident AND have a clear opinion.
  const uncertainty = memberScores.reduce((s, m) => s + (1 - m.confidence * Math.min(1, Math.abs(m.similarity - 0.5) * 4)), 0) / Math.max(1, memberScores.length);
  return {
    place,
    groupScore: round((g.avgWeight * mean + g.minWeight * min) / totalW),
    mean: round(mean),
    min: round(min),
    memberScores,
    uncertainty: round(uncertainty),
    vetoed: memberScores.some((m) => m.hates !== null),
  };
}

function deckReason(c: GroupCandidate, explore: boolean, dietary: string[]): string {
  const parts: string[] = [];
  if (explore) parts.push("wildcard: helps us learn the group's taste");
  else if (c.min >= 0.6) parts.push("a good fit for everyone");
  else if (c.mean >= 0.6) parts.push("most of the group should like it");
  const cu = tasteTagsOf(c.place).slice(0, 2);
  if (cu.length) parts.push(cu.join(", "));
  if (c.place.rating != null) parts.push(`${c.place.rating.toFixed(1)}★`);
  parts.push(...dietaryHighlights(c.place, dietary));
  return parts.join(", ");
}

/** Spread explore picks evenly through the deck instead of piling them at the end. */
function interleave(main: DeckItem[], explore: DeckItem[]): DeckItem[] {
  if (!explore.length) return main;
  const out = [...main];
  const step = (main.length + explore.length) / (explore.length + 1);
  explore.forEach((e, i) => out.splice(Math.min(out.length, Math.round(step * (i + 1))), 0, e));
  return out;
}

export function buildGroupDeck(
  members: readonly GroupMember[],
  places: readonly RestaurantCandidate[],
  opts: {
    city?: string;
    /** Only these kinds of place ("dinner", "dessert", "activity"). Default: all of them. */
    categories?: readonly string[];
    deckSize?: number;
    exploreSlots?: number;
    catalog?: readonly RestaurantCandidate[];
    config?: RecommenderConfig;
  } = {},
): GroupDeck {
  const cfg = opts.config ?? RECOMMENDER_CONFIG;
  const g = cfg.group;
  const deckSize = opts.deckSize ?? g.deckSize;
  const warnings: string[] = [];
  const counts = { input: places.length, otherCategory: 0, outOfCity: 0, dietary: 0, vetoed: 0 };
  const dietary = unionDietary(members.map((m) => m.ctx.preferences.dietary));

  if (!members.length) return { deck: [], ranked: [], city: null, dietary, vetoDropped: false, counts, warnings: ["No members in the session."] };

  // 1. Kind of place, then city area (places in Cambridge count for a Boston squad)
  const wanted = opts.categories ? new Set(opts.categories) : null;
  let pool = wanted ? places.filter((p) => wanted.has(p.category)) : [...places];
  counts.otherCategory = places.length - pool.length;
  const city = resolveCity(members, opts.city);
  const beforeCity = pool.length;
  if (city) {
    const area = areaOf(city, cfg);
    pool = pool.filter((p) => p.city != null && areaOf(p.city, cfg) === area);
  } else warnings.push("No city for this group: using every place.");
  counts.outOfCity = beforeCity - pool.length;

  // 2. Dietary: union of every member's restrictions, strict
  const safe = filterByDietary(pool, dietary);
  counts.dietary = pool.length - safe.length;

  // 3. Score each place for each member, aggregate
  const catalog = opts.catalog ?? places;
  const profiled = members.map((m) => profileUser(m.ctx, catalog, m.swipes, cfg));
  const ids = members.map((m) => m.id);
  const scored = safe.map((p) => scoreForGroup(profiled, ids, p, cfg)).sort((a, b) => b.groupScore - a.groupScore || a.place.id.localeCompare(b.place.id));

  // 4. Veto, unless it would leave too few places
  const kept = scored.filter((c) => !c.vetoed);
  let vetoDropped = false;
  let ranked = kept;
  if (kept.length < g.minAfterVeto && scored.length > kept.length) {
    vetoDropped = true;
    ranked = scored;
    warnings.push(
      `The "someone would hate it" veto would have left only ${kept.length} place${kept.length === 1 ? "" : "s"}, so it was turned off; some deck places may be a poor fit for a member.`,
    );
  } else counts.vetoed = scored.length - kept.length;

  // 5. Deck: MMR on group score for most slots, then lower-confidence explore picks
  const exploreN = Math.min(opts.exploreSlots ?? g.exploreSlots, Math.max(0, ranked.length - 1), Math.floor(deckSize / 3));
  const mainN = Math.min(deckSize - exploreN, ranked.length);
  const main = mmrRerank(ranked.map((c) => ({ c, place: c.place, score: c.groupScore })), mainN, cfg.mmr.lambda, cfg).map((x) => x.c);
  const chosen = new Set(main.map((c) => c.place.id));
  const seenCuisines = new Set(main.flatMap((c) => cuisinesOf(c.place)));
  const explore = ranked
    .filter((c) => !chosen.has(c.place.id))
    .map((c) => ({ c, v: 0.5 * c.uncertainty + 0.3 * c.groupScore + (cuisinesOf(c.place).some((x) => !seenCuisines.has(x)) ? 0.2 : 0) }))
    .sort((a, b) => b.v - a.v || a.c.place.id.localeCompare(b.c.place.id))
    .slice(0, exploreN)
    .map((x) => x.c);

  const toItem = (c: GroupCandidate, ex: boolean): DeckItem => ({ ...c, explore: ex, reason: deckReason(c, ex, dietary) });
  const deck = interleave(main.map((c) => toItem(c, false)), explore.map((c) => toItem(c, true)));
  if (deck.length === 0) warnings.push("No places satisfy everyone's dietary restrictions in this city.");
  else if (deck.length < Math.min(deckSize, 15)) warnings.push(`Only ${deck.length} places fit this group.`);

  return { deck, ranked, city, dietary, vetoDropped, counts, warnings };
}

// ------------------------------------------------------------- after swipes

/**
 * Members who didn't finish swiping: their missing swipes don't count for or against a place
 * (like ratio uses only members who swiped), but a place can only be "unanimous" if EVERY member
 * swiped right on it. Later duplicate votes from the same member on the same place win.
 */
export function rankAfterSwipes(
  deck: Pick<GroupDeck, "deck" | "ranked">,
  votes: readonly GroupVote[],
  memberIds: readonly string[],
  opts: { topN?: number; config?: RecommenderConfig } = {},
): GroupRanking {
  const cfg = opts.config ?? RECOMMENDER_CONFIG;
  const topN = opts.topN ?? cfg.group.topN;
  const members = new Set(memberIds);
  const deckIds = new Set(deck.deck.map((d) => d.place.id));
  const warnings: string[] = [];

  const latest = new Map<string, GroupVote>();
  let ignored = 0;
  for (const v of votes) {
    if (!members.has(v.memberId) || !deckIds.has(v.placeId)) {
      ignored++;
      continue;
    }
    const key = `${v.memberId}\u0000${v.placeId}`;
    const prev = latest.get(key);
    if (!prev || (v.at ?? Infinity) >= (prev.at ?? -Infinity)) latest.set(key, v);
  }
  if (ignored) warnings.push(`Ignored ${ignored} vote${ignored === 1 ? "" : "s"} from non-members or for places not in the deck.`);

  const tally = new Map<string, { likes: number; dislikes: number }>();
  for (const v of latest.values()) {
    const t = tally.get(v.placeId) ?? { likes: 0, dislikes: 0 };
    if (v.liked) t.likes++;
    else t.dislikes++;
    tally.set(v.placeId, t);
  }

  const toPick = (c: GroupCandidate): Omit<GroupPick, "rank"> => {
    const t = tally.get(c.place.id) ?? { likes: 0, dislikes: 0 };
    const swiped = t.likes + t.dislikes;
    return {
      place: c.place,
      status: t.likes > 0 ? "liked" : swiped === 0 ? "not-voted" : "no-likes",
      likes: t.likes,
      dislikes: t.dislikes,
      swiped,
      likeRatio: swiped ? round(t.likes / swiped) : null,
      unanimous: members.size > 0 && t.likes === members.size,
      groupScore: c.groupScore,
    };
  };

  const byFallback = (a: Omit<GroupPick, "rank">, b: Omit<GroupPick, "rank">) =>
    b.groupScore - a.groupScore || (b.place.rating ?? 0) - (a.place.rating ?? 0) || a.place.id.localeCompare(b.place.id);
  const rankScore = (p: Omit<GroupPick, "rank">) => (p.likeRatio ?? 0) + (p.unanimous ? cfg.group.unanimousBonus : 0);

  const deckPicks = deck.deck.map(toPick);
  const liked = deckPicks.filter((p) => p.status === "liked").sort((a, b) => rankScore(b) - rankScore(a) || byFallback(a, b));

  // Fill: unvoted deck places + eligible places that weren't in the deck, by group score.
  // Places that only got dislikes come last, and only if nothing else is left.
  const notVoted = [...deckPicks.filter((p) => p.status === "not-voted"), ...deck.ranked.filter((c) => !deckIds.has(c.place.id)).map(toPick)].sort(byFallback);
  const noLikes = deckPicks.filter((p) => p.status === "no-likes").sort(byFallback);

  const picks = [...liked, ...notVoted, ...noLikes].slice(0, topN).map((p, i) => ({ ...p, rank: i + 1 }));
  const filled = picks.filter((p) => p.status !== "liked").length;
  if (filled) warnings.push(`Only ${picks.length - filled} place${picks.length - filled === 1 ? "" : "s"} got a like; filled ${filled} from the top group scores.`);
  return { picks, filled, warnings };
}

/** Each member's group swipes, as Swipe records to feed back into their individual profile. */
export function groupVotesToSwipes(votes: readonly GroupVote[], sessionId: string): Map<string, Swipe[]> {
  const out = new Map<string, Swipe[]>();
  for (const v of votes) {
    const list = out.get(v.memberId) ?? [];
    list.push(...groupSwipesToHistory([v], sessionId));
    out.set(v.memberId, list);
  }
  return out;
}
