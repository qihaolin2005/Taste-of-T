// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Every tunable number for the recommenders lives here.

export const RECOMMENDER_CONFIG = {
  /** Final-score blend for the individual recommender. Weights are relative (renormalized). */
  blend: {
    similarity: 0.5, // cosine(user preference vector, restaurant vector)
    quality: 0.3, // Bayesian rating (rating weighted by review count)
    distance: 0.2, // closer is better, linear to 0 at the search radius
  },

  /**
   * Cold start. The similarity weight is scaled by confidence = n / (n + coldStartK), where n is
   * the total |weight| of the user's interactions; the freed weight goes to quality + distance.
   * With 0 interactions the score is quality + distance only; at n = coldStartK it's half-on.
   */
  coldStartK: 4,

  /** How strongly each kind of interaction counts toward the preference vector. Signed. */
  signals: {
    swipeLike: 1,
    swipeDislike: -1,
    /** Group swipes count, but less than a solo swipe (taste in a group is a compromise). */
    groupSwipeFactor: 0.7,
    /** Rating 0-10 maps linearly to (score - 5) / 5 in [-1, 1]; |w| below this is ignored as neutral. */
    ratingNeutralBand: 0.2,
    wishlist: 0.3,
    checkIn: 0.3,
    /** Cap on the summed weak signals (wishlist + check-in) for a place with no rating/swipe. */
    weakCap: 0.5,
  },

  /** Recency: weight *= 0.5 ^ (rank / halfLife), rank 0 = most recent in its list. */
  recencyHalfLife: 10,

  /** Places whose net interaction weight is at or below this are not recommended again. */
  excludeDislikedAt: -0.2,

  /** Block weights inside the restaurant feature vector (scale each block before cosine). */
  vectorBlocks: { cuisine: 1, price: 0.5, quality: 0.3, dietary: 0.3 },

  /** Bayesian rating: shrink toward priorMean with the weight of priorCount reviews. */
  rating: { priorMean: 3.8, priorCount: 50, max: 5, /** Bayesian rating at or below this maps to quality 0. */ floor: 3 },

  candidates: {
    nearbyRadiusMiles: 5,
    /** Destination mode: places tagged with the neighborhood, plus anything this close to its center. */
    destinationRadiusMiles: 0.75,
  },

  /** MMR re-ranking: lambda * relevance - (1 - lambda) * max cuisine similarity to already-picked. */
  mmr: { lambda: 0.7 },

  defaultLimit: 10,

  /** Reasons: thresholds for when a fact is worth saying. */
  reasons: { minSimilarity: 0.35, goodRating: 4.3, minReviewsForRating: 25 },

  group: {
    /** Group score = avgWeight * mean(member scores) + minWeight * min(member scores). */
    avgWeight: 0.6,
    minWeight: 0.4,
    /** A member score below this vetoes the place ("someone would hate it"). Scores are 0-1. */
    hateThreshold: 0.3,
    /** ...or a confident member's taste similarity (0-1, 0.5 = neutral) is below this. 0.25 = cosine < -0.5. */
    hateSimilarity: 0.25,
    hateMinConfidence: 0.3,
    /** If the veto leaves fewer than this many places, drop the veto (and say so). */
    minAfterVeto: 5,
    deckSize: 18,
    /** How many deck slots go to lower-confidence picks, to learn from the swipes. */
    exploreSlots: 3,
    topN: 5,
    /** Extra like-ratio credit for a unanimous like among members who swiped. */
    unanimousBonus: 0.25,
  },
};

export type RecommenderConfig = typeof RECOMMENDER_CONFIG;
