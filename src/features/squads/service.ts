// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Squad session flow. Route handlers (P3) call these; see docs/squad-session-api.md.
//
//   host:    startAdventure()  collecting -> swiping, shortlist of 10 saved on the room
//   members: submitSwipe()     right/left on each of the 10; auto-finishes when everyone is done
//   anyone:  getLiveState()    poll every ~2 s: progress, live top 5, my swipes, final plan
//   host:    endAdventure()    finish early with whatever swipes are in
//
// Hosts and members can be guests (anonymous users) or signed in; only the user id matters.
import {
  buildSquadPlan,
  buildUserContext,
  createSessionDeck,
  deckCategoryForStops,
  liveStandings,
  readSessionDeck,
  RECOMMENDER_CONFIG,
  sessionProgress,
  squadMemberContext,
  type RecommenderConfig,
  type RestaurantCandidate,
  type SessionDeck,
  type SessionMember,
  type SquadPlan,
} from "@/features/ml";
import { readTags } from "@/features/users";
import {
  beginSwiping,
  completeRoom,
  getRoomWithMembers,
  latestRoomPlan,
  listRoomVotes,
  loadUserSwipes,
  participantKey,
  ROOM_STATUS,
  upsertSquadSwipe,
  type Db,
  type RoomWithMembers,
} from "./store";

export type SquadErrorCode = "not_found" | "forbidden" | "conflict" | "bad_request";

export class SquadSessionError extends Error {
  constructor(
    public code: SquadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SquadSessionError";
  }
}

const fail = (code: SquadErrorCode, message: string): never => {
  throw new SquadSessionError(code, message);
};

async function loadRoom(db: Db, roomId: string): Promise<RoomWithMembers> {
  return (await getRoomWithMembers(db, roomId)) ?? fail("not_found", "Squad not found.");
}

function deckOf(room: RoomWithMembers): SessionDeck {
  return readSessionDeck(room.deck) ?? fail("conflict", "This squad has no active deck.");
}

/** Participant keys of everyone currently in the room (members who left are no longer rows). */
function activeKeys(room: RoomWithMembers): string[] {
  return room.members.flatMap((m) => (m.userId ? [participantKey(m.userId)] : []));
}

// ------------------------------------------------------------- start

export type StartOptions = {
  /** Candidate restaurants (e.g. from the places client). */
  places: readonly RestaurantCandidate[];
  /** All known places, so history outside the candidates still counts. Defaults to places. */
  catalog?: readonly RestaurantCandidate[];
  city?: string;
  now?: Date;
  config?: RecommenderConfig;
};

/** Host only. Combines every member's taste + history into a shortlist of 10 and opens swiping. */
export async function startAdventure(db: Db, roomId: string, userId: string, opts: StartOptions): Promise<SessionDeck> {
  const cfg = opts.config ?? RECOMMENDER_CONFIG;
  const now = opts.now ?? new Date();
  const room = await loadRoom(db, roomId);
  if (room.hostUserId !== userId) fail("forbidden", "Only the squad's host can start the adventure.");
  if (room.status !== ROOM_STATUS.collecting) fail("conflict", "This adventure has already started.");
  // Every member needs a user (guest or signed in) to swipe; a row whose user was deleted can't take part.
  const people = room.members.flatMap((m) => (m.userId ? [{ ...m, userId: m.userId }] : []));
  if (people.length === 0) fail("bad_request", "Nobody has joined the squad yet.");

  const members: SessionMember[] = await Promise.all(
    people.map(async (m) => {
      const userCtx = await buildUserContext(db, m.userId, now);
      const prefsCity = (await db.userPreferences.findUnique({ where: { userId: m.userId }, select: { city: true } }))?.city;
      return {
        memberId: participantKey(m.userId),
        ctx: squadMemberContext({ ...m, tastes: readTags(m.tastes), avoid: readTags(m.avoid), dietary: readTags(m.dietary) }, userCtx, now),
        swipes: await loadUserSwipes(db, m.userId, cfg.session.historySwipes),
        city: m.city ?? prefsCity ?? null,
      };
    }),
  );

  // The shortlist is for the night's first stop the host picked (dinner, else dessert, else activity).
  const category = deckCategoryForStops(room.slots);
  const deck = createSessionDeck(members, opts.places, { city: opts.city, category, catalog: opts.catalog, now, config: cfg });
  if (deck.items.length === 0) fail("bad_request", deck.warnings.join(" ") || "No restaurants fit this squad.");
  if (!(await beginSwiping(db, roomId, deck, now))) fail("conflict", "This adventure has already started.");
  return deck;
}

// ------------------------------------------------------------- swipe

export type SwipeResult = { finished: boolean; plan: SquadPlan | null };

/** A member votes on one shortlist place. Swiping the same place again changes the vote. */
export async function submitSwipe(db: Db, roomId: string, userId: string, placeId: string, liked: boolean, now = new Date()): Promise<SwipeResult> {
  const room = await loadRoom(db, roomId);
  if (room.status === ROOM_STATUS.collecting) fail("conflict", "The host hasn't started the adventure yet.");
  if (room.status === ROOM_STATUS.planned) fail("conflict", "Swiping is over: the plan is ready.");
  const deck = deckOf(room);
  const member = room.members.find((m) => m.userId === userId) ?? fail("forbidden", "You're not in this squad.");
  // Matched by user, so someone who left and rejoined carries on with their earlier swipes.
  if (!deck.memberIds.includes(participantKey(userId))) fail("forbidden", "You joined after the adventure started, so you can't swipe on this one.");
  if (!deck.items.some((i) => i.place.id === placeId)) fail("bad_request", "That restaurant isn't in this squad's shortlist.");

  await upsertSquadSwipe(db, { roomId, memberId: member.id, userId, placeId, liked });

  const plan = await finishIfEveryoneDone(db, room, deck, now);
  return { finished: plan !== null, plan };
}

/**
 * Finish when everyone STILL in the squad has swiped all 10. Called after each swipe and on each
 * poll, so the session also completes when the last unfinished member leaves (even the host).
 */
async function finishIfEveryoneDone(db: Db, room: RoomWithMembers, deck: SessionDeck, now: Date): Promise<SquadPlan | null> {
  const votes = await listRoomVotes(db, room.id);
  if (!sessionProgress(deck, votes, activeKeys(room)).allDone) return null;
  return finish(db, room, deck, now);
}

async function finish(db: Db, room: RoomWithMembers, deck: SessionDeck, now: Date): Promise<SquadPlan> {
  const votes = await listRoomVotes(db, room.id);
  const plan = buildSquadPlan(deck, votes, { now, active: activeKeys(room) });
  const saved = await completeRoom(db, room.id, plan, { kind: "squad-session", roomId: room.id, memberIds: deck.memberIds }, room.hostUserId, now);
  return (saved?.result as SquadPlan | undefined) ?? plan;
}

/** Host only: finish now with whatever swipes are in. */
export async function endAdventure(db: Db, roomId: string, userId: string, now = new Date()): Promise<SquadPlan> {
  const room = await loadRoom(db, roomId);
  if (room.hostUserId !== userId) fail("forbidden", "Only the squad's host can end the adventure.");
  if (room.status !== ROOM_STATUS.swiping) fail("conflict", room.status === ROOM_STATUS.planned ? "The plan is already made." : "The adventure hasn't started.");
  return finish(db, room, deckOf(room), now);
}

// ------------------------------------------------------------- live state (polled)

export type LiveState = {
  roomId: string;
  status: string;
  isHost: boolean;
  /** Changes whenever anything visible changes; clients can skip re-rendering when it's the same. */
  version: string;
  /** The viewer's member id, if they're in the squad. */
  myMemberId: string | null;
  /** Kind of place on the cards ("dinner", "dessert", "activity"); null before the host starts. */
  category: string | null;
  /** Shortlist to swipe on (null before the host starts). */
  deck: { placeId: string; name: string | null; cuisines: string[]; rating: number | null; priceLevel: number | null; neighborhood: string | null; reason: string }[] | null;
  /** Members still in the squad. */
  progress: { memberId: string; name: string; swiped: number; total: number; done: boolean }[];
  /** How many people left during swiping (their votes no longer count). */
  leftCount: number;
  /** The viewer's own votes: placeId -> liked. */
  mySwipes: Record<string, boolean>;
  /** Live top 5 while swiping; the final picks once planned. */
  standings: { rank: number; placeId: string; name: string | null; likes: number; swiped: number; status: string; reason: string }[];
  plan: SquadPlan | null;
  warnings: string[];
  /** Set when some cards cost more than the squad's tightest budget (no amounts: budgets are private). */
  budgetNote: string | null;
};

export async function getLiveState(db: Db, roomId: string, viewerUserId: string | null, now = new Date()): Promise<LiveState> {
  let room = await loadRoom(db, roomId);
  // A member leaving can make "everyone left has finished" true without anyone swiping: finish here.
  const pending = room.status === ROOM_STATUS.swiping ? readSessionDeck(room.deck) : null;
  if (pending && (await finishIfEveryoneDone(db, room, pending, now))) room = await loadRoom(db, roomId);
  const me = viewerUserId ? room.members.find((m) => m.userId === viewerUserId) : undefined;
  const deck = readSessionDeck(room.deck);
  const base = { roomId, status: room.status, isHost: viewerUserId != null && room.hostUserId === viewerUserId, myMemberId: me?.id ?? null };

  if (!deck) {
    return {
      ...base,
      version: `${room.status}:${room.members.length}`,
      category: null,
      deck: null,
      progress: room.members.map((m) => ({ memberId: m.id, name: m.name, swiped: 0, total: 0, done: false })),
      leftCount: 0,
      mySwipes: {},
      standings: [],
      plan: null,
      warnings: [],
      budgetNote: null,
    };
  }

  const votes = await listRoomVotes(db, roomId);
  const active = activeKeys(room);
  const progress = sessionProgress(deck, votes, active);
  const byKey = new Map(room.members.flatMap((m) => (m.userId ? [[participantKey(m.userId), m] as const] : [])));
  const myKey = viewerUserId ? participantKey(viewerUserId) : null;
  const plan = room.status === ROOM_STATUS.planned ? ((await latestRoomPlan(db, roomId))?.result as SquadPlan | undefined) ?? null : null;
  const live = plan ? { picks: plan.picks, warnings: plan.warnings } : liveStandings(deck, votes, undefined, active);
  const lastVote = votes.reduce((t, v) => Math.max(t, v.at ?? 0), 0);

  return {
    ...base,
    version: `${room.status}:${votes.length}:${lastVote}:${active.length}`,
    category: deck.category ?? "dinner",
    deck: deck.items.map((i) => ({
      placeId: i.place.id,
      name: i.place.name ?? null,
      cuisines: i.place.cuisines ?? i.place.tags,
      rating: i.place.rating ?? null,
      priceLevel: i.place.priceLevel ?? null,
      neighborhood: i.place.neighborhood ?? null,
      reason: i.reason,
    })),
    progress: progress.members.map((p) => {
      const m = byKey.get(p.memberId)!;
      return { memberId: m.id, name: m.name, swiped: p.swiped, total: p.total, done: p.done };
    }),
    leftCount: progress.left.length,
    mySwipes: Object.fromEntries(votes.filter((v) => myKey !== null && v.memberId === myKey).map((v) => [v.placeId, v.liked])),
    standings: live.picks.map((p) => ({ rank: p.rank, placeId: p.place.id, name: p.place.name ?? null, likes: p.likes, swiped: p.swiped, status: p.status, reason: p.reason })),
    plan,
    warnings: [...deck.warnings, ...live.warnings],
    budgetNote: deck.overBudget ? "Not enough spots nearby fit everyone's budget, so a few of these cost a bit more. Check the $ on each card." : null,
  };
}
