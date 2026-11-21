// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// UserContext -> fixed-length numeric vector, for classic ML (logistic regression, GBDT, MLP).
// Every value has a name in FEATURE_NAMES (same order), so a Python model can build a
// DataFrame with named columns. All values are roughly in [-1, 1] or {0, 1}.
// If you change names or order, bump FEATURE_VERSION and retrain.
import { distanceMeters } from "@/lib/geo";
import type { UserContext } from "./context";
import { DIETARY_VOCAB, LINE_FAMILIES, TASTE_VOCAB } from "./vocab";

export const FEATURE_VERSION = 1;

/** Downtown Crossing: origin for relative location features. */
const ORIGIN = { lat: 42.35552, lng: -71.06036 };

const NUMERIC = [
  "budget_norm", // budget / $100, capped at 1.5 (0 if unknown)
  "has_budget",
  "max_walk_norm", // minutes / 30 (0 if unknown)
  "has_location",
  "loc_east_km_norm", // km east of Downtown Crossing / 10 (0 if no location)
  "loc_north_km_norm", // km north of Downtown Crossing / 10
  "hour_sin", // time of day as a circle, so 23:00 and 01:00 are close
  "hour_cos",
  "dow_sin", // day of week as a circle
  "dow_cos",
  "is_weekend",
  "is_late_night", // 21:00-03:59, when most places are closed
  "checkins_log", // log1p(count) / 5
  "stamps_frac", // stamped stations / 125
  "ratings_count_log",
  "ratings_mean_norm", // (mean score - 5) / 5, 0 if none
  "wishlist_count_log",
  "unknown_taste_count", // tastes outside TASTE_VOCAB (signal that vocab needs updating)
] as const;

export const FEATURE_NAMES: readonly string[] = [
  ...TASTE_VOCAB.map((t) => `taste:${t}`),
  ...TASTE_VOCAB.map((t) => `avoid:${t}`),
  ...DIETARY_VOCAB.map((d) => `diet:${d}`),
  ...LINE_FAMILIES.map((f) => `home_line:${f}`),
  ...LINE_FAMILIES.map((f) => `visited_line:${f}`),
  ...NUMERIC,
];

export type FeatureVector = { version: number; names: readonly string[]; values: number[] };

const TAU = 2 * Math.PI;
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function toFeatures(ctx: UserContext): FeatureVector {
  const { preferences: p, location, time, history: h } = ctx;
  const tastes = new Set(p.tastes);
  const avoid = new Set(p.avoid);
  const diet = new Set(p.dietary);
  const homeLines = new Set(ctx.stations.homeLines);
  const visited = new Set(h.linesVisited);

  let east = 0;
  let north = 0;
  if (location) {
    north = (Math.sign(location.lat - ORIGIN.lat) * distanceMeters(ORIGIN, { lat: location.lat, lng: ORIGIN.lng })) / 1000;
    east = (Math.sign(location.lng - ORIGIN.lng) * distanceMeters(ORIGIN, { lat: ORIGIN.lat, lng: location.lng })) / 1000;
  }
  const hourFrac = time.minutesAfterMidnight / 1440;
  const ratingMean = h.ratings.length ? h.ratings.reduce((s, r) => s + r.score, 0) / h.ratings.length : null;
  const vocab = new Set<string>(TASTE_VOCAB);

  const numeric: Record<(typeof NUMERIC)[number], number> = {
    budget_norm: p.budgetPerPerson == null ? 0 : Math.min(1.5, p.budgetPerPerson / 100),
    has_budget: p.budgetPerPerson == null ? 0 : 1,
    max_walk_norm: p.maxWalkMinutes == null ? 0 : Math.min(2, p.maxWalkMinutes / 30),
    has_location: location ? 1 : 0,
    loc_east_km_norm: east / 10,
    loc_north_km_norm: north / 10,
    hour_sin: Math.sin(TAU * hourFrac),
    hour_cos: Math.cos(TAU * hourFrac),
    dow_sin: Math.sin((TAU * time.dayOfWeek) / 7),
    dow_cos: Math.cos((TAU * time.dayOfWeek) / 7),
    is_weekend: time.isWeekend ? 1 : 0,
    is_late_night: time.localHour >= 21 || time.localHour < 4 ? 1 : 0,
    checkins_log: Math.log1p(h.checkInCount) / 5,
    stamps_frac: h.stampedStationIds.length / 125,
    ratings_count_log: Math.log1p(h.ratings.length) / 5,
    ratings_mean_norm: ratingMean == null ? 0 : (ratingMean - 5) / 5,
    wishlist_count_log: Math.log1p(h.wishlistPlaceIds.length) / 5,
    unknown_taste_count: Math.min(5, p.tastes.filter((t) => !vocab.has(t)).length) / 5,
  };

  const values = [
    ...TASTE_VOCAB.map((t) => (tastes.has(t) ? 1 : 0)),
    ...TASTE_VOCAB.map((t) => (avoid.has(t) ? 1 : 0)),
    ...DIETARY_VOCAB.map((d) => (diet.has(d) ? 1 : 0)),
    ...LINE_FAMILIES.map((f) => (homeLines.has(f) ? 1 : 0)),
    ...LINE_FAMILIES.map((f) => (visited.has(f) ? 1 : 0)),
    ...NUMERIC.map((k) => numeric[k]),
  ].map(round4);

  return { version: FEATURE_VERSION, names: FEATURE_NAMES, values };
}
