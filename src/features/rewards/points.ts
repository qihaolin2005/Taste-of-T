// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// Pure points math. No database: service.ts gathers the facts and stores the result.
import { REWARDS_CONFIG, type RewardsConfig } from "./config";

export type TravelMode = "bus" | "t" | "none";

export type VisitFacts = {
  /** Receipt total in USD. */
  receiptTotal: number;
  /** People the bill covers; spend points use the per-person share. */
  dinersOnReceipt: number;
  /** Verified travel mode; "none" when unverified or not by bus/T. */
  travelMode: TravelMode;
  /** How many rewarded visits this user already has at this place. */
  previousVisits: number;
};

export type PointsBreakdown = {
  meal: number;
  spend: number;
  perPersonUsd: number;
  travel: number;
  travelMode: TravelMode;
  firstVisit: number;
  repeatFactor: number;
  /** (meal + spend + travel + firstVisit) x repeatFactor, rounded. Before the group multiplier. */
  base: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function repeatFactor(previousVisits: number, cfg: RewardsConfig = REWARDS_CONFIG): number {
  return cfg.repeatFactors[previousVisits] ?? cfg.repeatFactorAfter;
}

export function basePoints(f: VisitFacts, cfg: RewardsConfig = REWARDS_CONFIG): PointsBreakdown {
  const diners = Math.max(1, Math.floor(f.dinersOnReceipt));
  const perPersonUsd = round2(Math.max(0, f.receiptTotal) / diners);
  const spend = round2(Math.min(perPersonUsd, cfg.spend.maxPerPersonUsd) * cfg.spend.pointsPerDollar);
  const travel = cfg.travel[f.travelMode] ?? 0;
  const firstVisit = f.previousVisits === 0 ? cfg.firstVisitBonus : 0;
  const factor = repeatFactor(f.previousVisits, cfg);
  return {
    meal: cfg.mealPoints,
    spend,
    perPersonUsd,
    travel,
    travelMode: f.travelMode,
    firstVisit,
    repeatFactor: factor,
    base: Math.round((cfg.mealPoints + spend + travel + firstVisit) * factor),
  };
}

/** 1 + perExtraPerson x (people - 1), people capped at the squad size limit. */
export function groupMultiplier(peopleWhoShowedUp: number, cfg: RewardsConfig = REWARDS_CONFIG): number {
  const n = Math.min(Math.max(1, Math.floor(peopleWhoShowedUp)), cfg.group.maxPeople);
  return round2(1 + cfg.group.perExtraPerson * (n - 1));
}

export const withGroup = (base: number, multiplier: number) => Math.round(base * multiplier);
