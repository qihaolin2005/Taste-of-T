// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Squad session ("Start adventure"), the ML side. Pure functions; persistence lives in
// src/features/squads (store.ts + service.ts).
//
//   1. createSessionDeck(): combine every member's taste + history -> shortlist of 10
//   2. members swipe right/left on all 10 -> sessionProgress() / liveStandings() as votes arrive
//   3. once everyone has swiped all 10 (or the host ends early) -> buildSquadPlan(): top 5
//
// The deck is snapshotted (places included) when the session starts, so live ranking and the
// final plan don't change if restaurant data or the member list changes mid-session.
import { memberToContext, type MemberInput, type UserContext } from "./context";
import { RECOMMENDER_CONFIG, type RecommenderConfig } from "./recommend/config";
import { normalizeDietary } from "./recommend/dietary";
import { buildGroupDeck, rankAfterSwipes, type DeckItem, type GroupCandidate, type GroupMember, type GroupPick, type GroupVote } from "./recommend/group";
import type { Swipe } from "./recommend/interactions";
import type { RestaurantCandidate } from "./recommend/restaurant";

export const SESSION_DECK_VERSION = 1;
export const SQUAD_PLAN_VERSION = 1;

export type SessionDeck = {
  version: typeof SESSION_DECK_VERSION;
  createdAt: string;
  /** RoomMember ids taking part. Fixed at start: people who join later don't block completion. */
  memberIds: string[];
  /** The shortlist everyone swipes on, in display order. */
  items: DeckItem[];
  /** Next-best eligible places nobody swipes on; only used to fill the top 5 if too few got likes. */
  backups: GroupCandidate[];
  city: string | null;
  dietary: string[];
  vetoDropped: boolean;
  warnings: string[];
};

export type MemberProgress = { memberId: string; swiped: number; liked: number; total: number; done: boolean };
export type SessionProgress = { members: MemberProgress[]; swiped: number; total: number; allDone: boolean };

export type SquadPlanPick = GroupPick & { reason: string };

/** What gets saved as Plan.result for a squad session. */
export type SquadPlan = {
  kind: "squad-top5";
  version: typeof SQUAD_PLAN_VERSION;
  createdAt: string;
  /** The #1 pick: the plan's recommendation. */
  recommended: SquadPlanPick | null;
  /** Ranked top 5 (fewer if the deck was smaller). */
  picks: SquadPlanPick[];
  /** false when the host ended the session before everyone finished swiping. */
  complete: boolean;
  progress: SessionProgress;
  warnings: string[];
};

// ------------------------------------------------------------- member contexts

/** A room member's join-form inputs plus city (RoomMember row). */
export type SquadMemberInput = MemberInput & { city?: string | null };

/**
 * One member's context for the session. Members with a user (signed-in or guest) start from
 * their full UserContext (history: ratings, wishlist, check-ins); the join form then wins for
 * tonight's tastes and budget. Dietary restrictions and avoid tags are UNIONED, never replaced,
 * so a restriction from either source is always enforced.
 */
export function squadMemberContext(member: SquadMemberInput, userCtx: UserContext | null, now = new Date()): UserContext {
  const fromForm = memberToContext(member, now);
  if (!userCtx) return fromForm;
  const f = fromForm.preferences;
  const u = userCtx.preferences;
  return {
    ...userCtx,
    preferences: {
      tastes: f.tastes.length ? f.tastes : u.tastes,
      avoid: normalizeDietary([...u.avoid, ...f.avoid]),
      dietary: normalizeDietary([...u.dietary, ...f.dietary]),
      budgetPerPerson: f.budgetPerPerson ?? u.budgetPerPerson,
      maxWalkMinutes: f.maxWalkMinutes ?? u.maxWalkMinutes,
    },
    stations: { ...userCtx.stations, start: fromForm.stations.start ?? userCtx.stations.start },
  };
}

export type SessionMember = { memberId: string; ctx: UserContext; swipes?: readonly Swipe[]; city?: string | null };

// ------------------------------------------------------------- 1. shortlist

export function createSessionDeck(
  members: readonly SessionMember[],
  places: readonly RestaurantCandidate[],
  opts: { city?: string; catalog?: readonly RestaurantCandidate[]; now?: Date; config?: RecommenderConfig } = {},
): SessionDeck {
  const cfg = opts.config ?? RECOMMENDER_CONFIG;
  const groupMembers: GroupMember[] = members.map((m) => ({ id: m.memberId, ctx: m.ctx, swipes: m.swipes, city: m.city ?? undefined }));
  const g = buildGroupDeck(groupMembers, places, {
    city: opts.city,
    catalog: opts.catalog,
    deckSize: cfg.session.deckSize,
    exploreSlots: cfg.session.exploreSlots,
    config: cfg,
  });
  const inDeck = new Set(g.deck.map((d) => d.place.id));
  return {
    version: SESSION_DECK_VERSION,
    createdAt: (opts.now ?? new Date()).toISOString(),
    memberIds: members.map((m) => m.memberId),
    items: g.deck,
    backups: g.ranked.filter((c) => !inDeck.has(c.place.id)).slice(0, cfg.session.backups),
    city: g.city,
    dietary: g.dietary,
    vetoDropped: g.vetoDropped,
    warnings: g.warnings,
  };
}

// ------------------------------------------------------------- 2. live

/** Only votes from session members on deck places count. */
function validVotes(deck: SessionDeck, votes: readonly GroupVote[]): GroupVote[] {
  const members = new Set(deck.memberIds);
  const places = new Set(deck.items.map((i) => i.place.id));
  return votes.filter((v) => members.has(v.memberId) && places.has(v.placeId));
}

export function sessionProgress(deck: SessionDeck, votes: readonly GroupVote[]): SessionProgress {
  const total = deck.items.length;
  const per = new Map(deck.memberIds.map((id) => [id, new Map<string, boolean>()]));
  for (const v of validVotes(deck, votes)) per.get(v.memberId)!.set(v.placeId, v.liked);
  const members = deck.memberIds.map((memberId) => {
    const seen = per.get(memberId)!;
    return { memberId, swiped: seen.size, liked: [...seen.values()].filter(Boolean).length, total, done: seen.size >= total };
  });
  return {
    members,
    swiped: members.reduce((s, m) => s + m.swiped, 0),
    total: total * members.length,
    allDone: members.length > 0 && total > 0 && members.every((m) => m.done),
  };
}

function pickReason(p: GroupPick, memberCount: number): string {
  if (p.status === "liked") {
    if (p.unanimous) return memberCount > 1 ? `everyone liked it (${p.likes}/${memberCount})` : "you liked it";
    return `${p.likes} of ${p.swiped} liked it`;
  }
  if (p.status === "not-voted") return "not voted on: a top match for the group's taste";
  return "nobody liked it, but it was the best match left";
}

/** Current top 5 from the votes so far. Safe to call on every poll. */
export function liveStandings(deck: SessionDeck, votes: readonly GroupVote[], config: RecommenderConfig = RECOMMENDER_CONFIG): { picks: SquadPlanPick[]; warnings: string[] } {
  const r = rankAfterSwipes({ deck: deck.items, ranked: [...deck.items, ...deck.backups] }, validVotes(deck, votes), deck.memberIds, { config });
  return { picks: r.picks.map((p) => ({ ...p, reason: pickReason(p, deck.memberIds.length) })), warnings: r.warnings };
}

// ------------------------------------------------------------- 3. final plan

export function buildSquadPlan(deck: SessionDeck, votes: readonly GroupVote[], opts: { now?: Date; config?: RecommenderConfig } = {}): SquadPlan {
  const progress = sessionProgress(deck, votes);
  const { picks, warnings } = liveStandings(deck, votes, opts.config);
  const w = [...warnings];
  if (!progress.allDone) w.unshift(`Ended early: ${progress.swiped} of ${progress.total} swipes were in.`);
  return {
    kind: "squad-top5",
    version: SQUAD_PLAN_VERSION,
    createdAt: (opts.now ?? new Date()).toISOString(),
    recommended: picks[0] ?? null,
    picks,
    complete: progress.allDone,
    progress,
    warnings: w,
  };
}

/** Read a deck back from Room.deck JSON. Returns null for anything that isn't a v1 deck. */
export function readSessionDeck(json: unknown): SessionDeck | null {
  if (!json || typeof json !== "object") return null;
  const d = json as Partial<SessionDeck>;
  return d.version === SESSION_DECK_VERSION && Array.isArray(d.items) && Array.isArray(d.memberIds) && Array.isArray(d.backups) ? (d as SessionDeck) : null;
}
