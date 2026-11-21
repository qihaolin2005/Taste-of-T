// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// How the app asks a model "how good is each candidate place for this person?"
//
//   scoreCandidates(context, candidates)
//     -> remote model at ML_MODEL_URL, if set and it answers within ML_MODEL_TIMEOUT_MS
//     -> otherwise the built-in baseline (always works offline, so the demo never breaks)
//
// Scores: higher = better. `null` = never recommend (e.g. violates a dietary restriction).
// The planner uses these as the per-person taste score; it doesn't care which model made them.
import { z } from "zod";
import type { UserContext } from "./context";
import { toFeatures, type FeatureVector } from "./features";

export type CandidatePlace = {
  id: string;
  category: "dinner" | "dessert" | "activity";
  tags: string[];
  pricePerPerson: number;
  stationId: string;
  /** Dietary needs the place can serve ("vegetarian", "halal", ...). Undefined = unknown. */
  dietary?: string[];
};

export const candidateSchema = z.object({
  id: z.string().min(1).max(100),
  category: z.enum(["dinner", "dessert", "activity"]),
  tags: z.array(z.string().max(40)).max(30),
  pricePerPerson: z.number().min(0).max(1000),
  stationId: z.string().min(1).max(64),
  dietary: z.array(z.string().max(40)).max(20).optional(),
});

/** What we POST to ML_MODEL_URL. */
export type ModelRequest = { version: 1; context: UserContext; features: FeatureVector; candidates: CandidatePlace[] };
/** What ML_MODEL_URL must return: one score per candidate, same order. */
const modelResponseSchema = z.object({ scores: z.array(z.number().nullable()), model: z.string().optional() });

export type ScoreResult = {
  scores: (number | null)[];
  model: string;
  /** Set when the remote model was configured but we fell back to the baseline. */
  fallbackReason?: string;
};

export interface RecommenderModel {
  name: string;
  score(req: ModelRequest): Promise<(number | null)[]>;
}

// ------------------------------------------------------------- baseline

/**
 * Hand-written scorer, the safety net and a benchmark the trained model must beat.
 *  - Hard rules (-> null): place has an "avoid" tag; place is known not to serve a dietary need.
 *  - +1 per matching taste tag (max 3); unknown dietary support is a mild -0.5.
 *  - Over budget: -2 x how far over (e.g. 50% over = -1). The planner enforces the real budget.
 *  - Past rating of this exact place: (score - 5) / 5, so 10 = +1, 0 = -1. Wishlisted: +0.5.
 *  - At the person's nearest station: +0.3.
 */
export const baselineModel: RecommenderModel = {
  name: "baseline-v1",
  async score({ context: ctx, candidates }) {
    const tastes = new Set(ctx.preferences.tastes);
    const avoid = new Set(ctx.preferences.avoid);
    const ratings = new Map(ctx.history.ratings.map((r) => [r.placeId, r.score]));
    const wishlist = new Set(ctx.history.wishlistPlaceIds);
    const budget = ctx.preferences.budgetPerPerson;

    return candidates.map((c) => {
      const tags = c.tags.map((t) => t.toLowerCase());
      if (tags.some((t) => avoid.has(t))) return null;

      let score = 0;
      for (const need of ctx.preferences.dietary) {
        if (!c.dietary) score -= 0.5;
        else if (!c.dietary.includes(need)) return null;
      }
      score += Math.min(3, tags.filter((t) => tastes.has(t)).length);
      if (budget != null && budget > 0 && c.pricePerPerson > budget) score -= 2 * (c.pricePerPerson / budget - 1);
      const rated = ratings.get(c.id);
      if (rated != null) score += (rated - 5) / 5;
      if (wishlist.has(c.id)) score += 0.5;
      if (ctx.location?.nearestStationId === c.stationId) score += 0.3;
      return Math.round(score * 1000) / 1000;
    });
  },
};

// ------------------------------------------------------------- remote

/** Model served over HTTP (e.g. a Python FastAPI service). See src/features/ml/README.md. */
export function httpModel(url: string, timeoutMs: number): RecommenderModel {
  return {
    name: `remote:${new URL(url).host}`,
    async score(req) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (process.env.ML_MODEL_TOKEN) headers.authorization = `Bearer ${process.env.ML_MODEL_TOKEN}`;
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(req), signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`model responded ${res.status}`);
      const body = modelResponseSchema.parse(await res.json());
      if (body.scores.length !== req.candidates.length) throw new Error(`model returned ${body.scores.length} scores for ${req.candidates.length} candidates`);
      return body.scores;
    },
  };
}

function remoteFromEnv(): RecommenderModel | null {
  const url = process.env.ML_MODEL_URL;
  if (!url) return null;
  return httpModel(url, Number(process.env.ML_MODEL_TIMEOUT_MS) || 1500);
}

export async function scoreCandidates(
  context: UserContext,
  candidates: CandidatePlace[],
  model: RecommenderModel | null = remoteFromEnv(),
): Promise<ScoreResult> {
  const req: ModelRequest = { version: 1, context, features: toFeatures(context), candidates };
  if (candidates.length === 0) return { scores: [], model: (model ?? baselineModel).name };
  if (model) {
    try {
      return { scores: await model.score(req), model: model.name };
    } catch (err) {
      const scores = await baselineModel.score(req);
      return { scores, model: baselineModel.name, fallbackReason: `${model.name} failed: ${(err as Error).message}` };
    }
  }
  return { scores: await baselineModel.score(req), model: baselineModel.name };
}
