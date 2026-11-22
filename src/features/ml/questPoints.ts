// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// How many points a Spin quest is worth. Pure math, no database.
//
//   points = (base + distanceBonus) x priceMultiplier, rounded to the nearest 5
//
// Farther places pay a bit more (a longer trip, ideally on the T); pricier places pay a lot more.
// Tune here, not in the code; tests read the same values.

export const QUEST_POINTS_CONFIG = {
  base: 100,
  /** Points per mile from where you spun, capped so the distance part stays "a bit more". */
  perMile: 10,
  maxDistanceBonus: 50,
  /** By price level ($ to $$$$). */
  priceMultiplier: { 1: 1, 2: 1.75, 3: 2.5, 4: 4 } as Record<number, number>,
  /** When a place has no price level, pay it like this one ($). */
  unknownPriceLevel: 1,
  roundTo: 5,
};
export type QuestPointsConfig = typeof QUEST_POINTS_CONFIG;

export type QuestPointsInput = {
  /** 1-4 ($ to $$$$), null if unknown. */
  priceLevel: number | null | undefined;
  /** From where you are (or your start station) to the place, null if unknown. */
  distanceMiles: number | null | undefined;
};

export type QuestPointsBreakdown = {
  base: number;
  distanceBonus: number;
  priceLevel: number;
  priceMultiplier: number;
  points: number;
};

export function questPoints(input: QuestPointsInput, cfg: QuestPointsConfig = QUEST_POINTS_CONFIG): QuestPointsBreakdown {
  const miles = Math.max(0, input.distanceMiles ?? 0);
  const distanceBonus = Math.min(Math.round(miles * cfg.perMile), cfg.maxDistanceBonus);
  const level = input.priceLevel != null && cfg.priceMultiplier[input.priceLevel] != null ? input.priceLevel : cfg.unknownPriceLevel;
  const priceMultiplier = cfg.priceMultiplier[level];
  const raw = (cfg.base + distanceBonus) * priceMultiplier;
  const points = Math.max(cfg.roundTo, Math.round(raw / cfg.roundTo) * cfg.roundTo);
  return { base: cfg.base, distanceBonus, priceLevel: level, priceMultiplier, points };
}
