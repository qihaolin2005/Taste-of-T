// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// Every number in the reward system. Tune here, not in the code; tests read the same values.
//
//   points = (meal + spend + travel + firstVisit) x repeatFactor x groupMultiplier
//
// Goal: get people to actually go to the places we recommend, ideally together, by T or bus.

export const REWARDS_CONFIG = {
  /** Verified receipt at a place we recommended. The main thing we want. */
  mealPoints: 20,

  /** More spend = more points, per person, capped so a huge (or fake) bill isn't the best move. */
  spend: {
    pointsPerDollar: 0.5, // 1 point per $2
    maxPerPersonUsd: 60, // => at most 30 spend points
  },

  /** Verified ride to the restaurant (detected by the trip-tracking feature). Bus counts double. */
  travel: { bus: 10, t: 5, none: 0 },

  /** First time at this place: encourages trying somewhere new. */
  firstVisitBonus: 10,

  /** Multiplier by how many times you've already been rewarded at this place. */
  repeatFactors: [1, 1, 0.5] as number[], // 1st visit, 2nd, 3rd
  repeatFactorAfter: 0.25, // 4th visit onwards

  /** Bigger groups earn more: 1 + perExtraPerson x (people who actually showed up - 1). */
  group: {
    perExtraPerson: 0.05,
    maxPeople: 12, // same as the squad size limit (MAX_MEMBERS in src/features/rooms)
    /** Squad-mates count if they claimed a visit at the same place within this window. */
    windowHours: 12,
  },

  limits: {
    /** One reward per place per day (Boston date). */
    perPlacePerDay: 1,
    /** Rewarded visits per person per day. */
    visitsPerDay: 2,
    /** The place must have been recommended to you within this window. */
    recommendedWithinHours: 48,
    /** Receipt date must be within this many hours before the claim (and not in the future). */
    receiptMaxAgeHours: 36,
    maxReceiptUsd: 2000,
    maxDinersOnReceipt: 12,
  },
};

export type RewardsConfig = typeof REWARDS_CONFIG;
