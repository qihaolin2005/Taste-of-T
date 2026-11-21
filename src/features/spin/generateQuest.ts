// Owner: P1 - Planner & Quests (see TEAM.md)
// Spin the T: ask the ML recommender (src/features/ml, getRecommendations) for places within
// the distance you picked of where you are right now, apply your budget and craving, then
// "spin": a weighted-random pick from the top few, so it's a surprise but still a good match.
// The pick becomes a quest; arriving there on a recorded trip completes it.
//
// The model works in DISTANCE (radiusMiles from your position), not travel time, so Spin
// asks "how far?" instead of "how long?".
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { createQuest, type QuestView } from "@/features/gamification/quests";
import {
  getRecommendations,
  loadRestaurants,
  restaurantSchema,
  type RecommendationItem,
  type RecommendationsResponse,
  type RestaurantCandidate,
  type RestaurantSource,
} from "@/features/ml";
import { missionText, questTitle } from "./missionText";

type Db = PrismaClient;

export const SPIN_DISTANCES_MILES = [0.5, 1, 2, 5] as const;
/** Cuisines you can crave (from the model's taste vocabulary, food only). */
export const SPIN_CUISINES = [
  "pizza", "ramen", "sushi", "dumplings", "noodles", "thai", "chinese", "korean", "japanese", "vietnamese",
  "indian", "mexican", "tacos", "italian", "mediterranean", "burgers", "bbq", "seafood", "boba", "ice-cream", "bakery",
] as const;
const DESSERT_CUISINES = new Set(["boba", "ice-cream", "bakery", "dessert"]);
/** How many of the model's top results the spin picks from. */
export const SPIN_POOL = 6;

export const spinRequestSchema = z
  .object({
    /** The phone's position right now (not stored). Without it the model uses your saved location. */
    origin: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict().optional(),
    radiusMiles: z.number().positive().max(10),
    /** Most you want to spend, as a price level 1-4 ($ to $$$$). Omit for any. */
    budget: z.number().int().min(1).max(4).optional(),
    /** "anything" | "dinner" | "dessert" | a cuisine from SPIN_CUISINES */
    craving: z.enum(["anything", "dinner", "dessert", ...SPIN_CUISINES]).default("anything"),
    /** Places already spun this session, so "Spin again" shows something new. */
    exclude: z.array(z.string().min(1).max(200)).max(50).default([]),
  })
  .strict();
export type SpinRequest = z.infer<typeof spinRequestSchema>;

export type SpinPick = Pick<
  RecommendationItem,
  "placeId" | "name" | "category" | "cuisines" | "rating" | "priceLevel" | "neighborhood" | "distanceMiles" | "reason" | "score"
>;

export type SpinResult = {
  quest: QuestView;
  place: SpinPick & { lat: number | null; lng: number | null };
  mission: string;
  /** How many places it picked from, and how many the model found in range. */
  pool: number;
  found: number;
  /** "gps" when your phone's position was used. */
  origin: RecommendationsResponse["origin"];
  /** Why a filter was loosened, e.g. "No ramen within 1 mi, so here's something else you'll like." */
  notes: string[];
  model: string;
};

export class SpinError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function categoriesFor(craving: SpinRequest["craving"]): ("dinner" | "dessert")[] | undefined {
  if (craving === "dinner") return ["dinner"];
  if (craving === "dessert" || DESSERT_CUISINES.has(craving)) return ["dessert"];
  return undefined; // the model's default (food)
}

/**
 * Words in a place's name that mean the craving. Google has no place type for dumplings,
 * noodles, tacos, boba... (they come back as just "chinese" / "mexican" / a cafe), so the
 * name is often the only signal: "Gourmet Dumpling House", "El Jefe's Taqueria".
 */
const CRAVING_WORDS: Partial<Record<string, string[]>> = {
  dumplings: ["dumpling", "xiao long", "soup bun", "dim sum", "gyoza", "momo", "mandu", "pierogi"],
  noodles: ["noodle", "pho", "ramen", "udon", "lanzhou", "lamian", "mian"],
  ramen: ["ramen"],
  sushi: ["sushi", "omakase"],
  tacos: ["taco", "taqueria"],
  pizza: ["pizza", "pizzeria"],
  burgers: ["burger"],
  bbq: ["bbq", "barbecue", "smokehouse"],
  seafood: ["oyster", "fish", "seafood", "lobster", "clam", "crab"],
  boba: ["boba", "bubble tea", "milk tea", "tea house", "teahouse"],
  "ice-cream": ["ice cream", "gelato", "creamery", "froyo"],
  bakery: ["bakery", "bakehouse", "patisserie", "boulangerie", "bread"],
  vietnamese: ["pho", "banh mi"],
  korean: ["korean", "bibimbap"],
  thai: ["thai"],
  indian: ["indian", "curry", "masala", "tandoor"],
  mexican: ["taco", "taqueria", "burrito", "mexican", "cantina"],
};

function hasCuisine(r: RecommendationItem, craving: string): boolean {
  if (r.cuisines.some((x) => x.toLowerCase() === craving)) return true;
  const name = (r.name ?? "").toLowerCase();
  return (CRAVING_WORDS[craving] ?? [craving.replace("-", " ")]).some((w) => name.includes(w));
}
const withinBudget = (r: RecommendationItem, budget: number | undefined) => budget == null || r.priceLevel == null || r.priceLevel <= budget;

/**
 * Pick from the model's ranked list. Filters are loosened one at a time (cuisine, then budget,
 * then places you've already seen) rather than coming back empty.
 */
export function pickSpin(
  ranked: readonly RecommendationItem[],
  req: Pick<SpinRequest, "budget" | "craving" | "exclude" | "radiusMiles">,
  rng: () => number = Math.random,
): { pick: RecommendationItem; pool: number; notes: string[] } | null {
  if (!ranked.length) return null;
  const notes: string[] = [];
  const cuisine = req.craving !== "anything" && req.craving !== "dinner" && req.craving !== "dessert" ? req.craving : null;
  const seen = new Set(req.exclude);

  const attempts: { list: RecommendationItem[]; note?: string }[] = [];
  const fresh = ranked.filter((r) => !seen.has(r.placeId));
  const filter = (list: RecommendationItem[], useCuisine: boolean, useBudget: boolean) =>
    list.filter((r) => (!useCuisine || !cuisine || hasCuisine(r, cuisine)) && (!useBudget || withinBudget(r, req.budget)));
  const label = cuisine?.replace("-", " ");
  attempts.push({ list: filter(fresh, true, true) });
  if (cuisine) attempts.push({ list: filter(fresh, false, true), note: `No ${label} within ${req.radiusMiles} mi${req.budget ? " in your budget" : ""}, so here's something else you'll like.` });
  if (req.budget) attempts.push({ list: filter(fresh, false, false), note: `Nothing in your budget within ${req.radiusMiles} mi, so this one costs a bit more.` });
  if (seen.size) attempts.push({ list: filter(ranked as RecommendationItem[], true, true), note: "You've seen every spot nearby, so we're starting over." });

  const hit = attempts.find((a) => a.list.length);
  if (!hit) return null;
  if (hit.note) notes.push(hit.note);

  // Weighted spin over the top few: better matches are likelier, but any of them can come up.
  const pool = hit.list.slice(0, SPIN_POOL);
  const weights = pool.map((r) => Math.max(r.score, 0.05) ** 2);
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  let pick = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      pick = pool[i];
      break;
    }
  }
  return { pick, pool: pool.length, notes };
}

/** What to type into Google for a craving (searchCraving). */
const CRAVING_QUERY: Partial<Record<string, string>> = { boba: "boba tea", "ice-cream": "ice cream", bbq: "bbq", dumplings: "dumplings" };

export type SpinDeps = {
  source?: RestaurantSource | null;
  /**
   * Targeted search for a specific craving near you ("dumplings" near me), merged into what the
   * model ranks. The general restaurant list only has ~20 places per area, so a specific
   * craving can be missing from it even in the right neighborhood. Optional; failures ignored.
   */
  searchCraving?: (center: { lat: number; lng: number }, text: string, radiusM: number) => Promise<unknown[]>;
  /** Name + coordinates for the picked place (for the map / trip). */
  findPlace: (id: string) => Promise<{ lat: number; lng: number } | null>;
  rng?: () => number;
  now?: Date;
};

/** The general list plus a targeted search for a specific craving near you (deduped, validated). */
async function candidatesFor(req: SpinRequest, deps: SpinDeps): Promise<RestaurantCandidate[] | undefined> {
  const cuisine = req.craving !== "anything" && req.craving !== "dinner" && req.craving !== "dessert" ? req.craving : null;
  if (!cuisine || !req.origin || !deps.searchCraving) return undefined; // the model loads the general list itself
  const radiusM = req.radiusMiles * 1609.34;
  const [base, extra] = await Promise.all([
    loadRestaurants(deps.source),
    deps.searchCraving(req.origin, CRAVING_QUERY[cuisine] ?? cuisine.replace("-", " "), radiusM).catch(() => []),
  ]);
  const valid = extra.flatMap((p) => {
    const r = restaurantSchema.safeParse(p);
    return r.success ? [r.data as RestaurantCandidate] : [];
  });
  const seen = new Set<string>();
  return [...valid, ...base.places].filter((p) => !seen.has(p.id) && !!seen.add(p.id)).slice(0, 500);
}

export async function spinTheT(db: Db, userId: string, req: SpinRequest, deps: SpinDeps): Promise<SpinResult> {
  const candidates = await candidatesFor(req, deps);
  const recs = await getRecommendations(
    db,
    userId,
    { mode: { kind: "nearby", radiusMiles: req.radiusMiles }, origin: req.origin, limit: 50, categories: categoriesFor(req.craving), ...(candidates ? { candidates } : {}) },
    { source: deps.source, now: deps.now },
  );
  if (!recs) throw new SpinError("User not found.");

  const picked = pickSpin(recs.results, req, deps.rng);
  if (!picked) throw new SpinError(`Nothing the model likes within ${req.radiusMiles} mi. Try a bigger distance.`);
  const p = picked.pick;

  // Where it is: from the list the model ranked (covers the craving search), else a lookup.
  const listed = candidates?.find((c) => c.id === p.placeId);
  const coords = listed && typeof listed.lat === "number" && typeof listed.lng === "number" ? { lat: listed.lat, lng: listed.lng } : await deps.findPlace(p.placeId);

  // One open Spin quest at a time: spinning again replaces the last one you didn't do.
  await db.quest.updateMany({ where: { userId, status: "active", placeId: { not: null } }, data: { status: "abandoned" } });
  const quest = await createQuest(db, userId, { title: questTitle(p.name) });
  // The quest remembers where it is, so its trip knows where "arrived" is.
  await db.quest.update({ where: { id: quest.id }, data: { placeId: p.placeId, placeName: p.name, placeLat: coords?.lat ?? null, placeLng: coords?.lng ?? null } });
  return {
    quest,
    place: {
      placeId: p.placeId,
      name: p.name,
      category: p.category,
      cuisines: p.cuisines,
      rating: p.rating,
      priceLevel: p.priceLevel,
      neighborhood: p.neighborhood,
      distanceMiles: p.distanceMiles,
      reason: p.reason,
      score: p.score,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    },
    mission: missionText(p),
    pool: picked.pool,
    found: recs.results.length,
    origin: recs.origin,
    notes: [...picked.notes, ...recs.warnings],
    model: recs.model,
  };
}
