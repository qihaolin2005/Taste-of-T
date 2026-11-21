// Synthetic Boston restaurants and contexts for recommender tests. Names and numbers are made up.
import { userContextSchema, type RestaurantCandidate, type UserContext } from "@/features/ml";

export const PLACES = {
  // Back Bay (around Copley, 42.3500, -71.0770)
  bbThai: { lat: 42.3502, lng: -71.0765, neighborhood: "Back Bay", cuisines: ["thai"], rating: 4.5, reviewCount: 800, priceLevel: 2, dietStyle: "mixed", dietary: ["vegetarian", "vegan"] },
  bbItalian: { lat: 42.3495, lng: -71.0775, neighborhood: "Back Bay", cuisines: ["italian", "pizza"], rating: 4.4, reviewCount: 1200, priceLevel: 3, dietStyle: "mixed", dietary: ["vegetarian"] },
  bbSteak: { lat: 42.3510, lng: -71.0760, neighborhood: "Back Bay", cuisines: ["american", "burgers"], rating: 4.7, reviewCount: 2000, priceLevel: 4, dietStyle: "non-veg-only" },
  bbVegan: { lat: 42.3489, lng: -71.0790, neighborhood: "Back Bay", cuisines: ["vegan-friendly", "cafe"], rating: 4.2, reviewCount: 300, priceLevel: 2, dietStyle: "vegan-only" },
  // Chinatown (around 42.3513, -71.0626)
  ctDumpling: { lat: 42.3512, lng: -71.0620, neighborhood: "Chinatown", cuisines: ["chinese", "dumplings"], rating: 4.6, reviewCount: 1500, priceLevel: 1, dietStyle: "mixed", dietary: ["vegetarian"] },
  ctNoodle: { lat: 42.3518, lng: -71.0630, neighborhood: "Chinatown", cuisines: ["chinese", "noodles"], rating: 4.3, reviewCount: 600, priceLevel: 1, dietStyle: "mixed" }, // no dietary list: unknown
  ctThai: { lat: 42.3508, lng: -71.0618, neighborhood: "Chinatown", cuisines: ["thai", "spicy"], rating: 4.1, reviewCount: 400, priceLevel: 2, dietStyle: "mixed", dietary: ["vegetarian", "vegan"] },
  ctHotPot: { lat: 42.3505, lng: -71.0628, neighborhood: "Chinatown", cuisines: ["hot-pot", "chinese"], rating: 4.4, reviewCount: 900, priceLevel: 3, dietStyle: "mixed", dietary: ["vegetarian", "halal"] },
  // Cambridge (Harvard Sq, ~2.5 mi from Copley)
  hsIndian: { lat: 42.3730, lng: -71.1190, neighborhood: "Harvard Square", cuisines: ["indian", "spicy"], rating: 4.5, reviewCount: 700, priceLevel: 2, dietStyle: "mixed", dietary: ["vegetarian", "vegan", "halal"] },
  hsRamen: { lat: 42.3725, lng: -71.1180, neighborhood: "Harvard Square", cuisines: ["japanese", "ramen"], rating: 4.6, reviewCount: 1100, priceLevel: 2, dietStyle: "mixed", dietary: ["vegetarian"] },
  hsThai: { lat: 42.3735, lng: -71.1200, neighborhood: "Harvard Square", cuisines: ["thai"], rating: 3.9, reviewCount: 150, priceLevel: 2, dietStyle: "mixed", dietary: ["vegetarian", "vegan"] },
  // Far away (Worcester, ~40 mi): never "nearby"
  farThai: { lat: 42.2626, lng: -71.8023, neighborhood: "Worcester", cuisines: ["thai"], rating: 4.9, reviewCount: 5000, priceLevel: 1, dietStyle: "mixed", dietary: ["vegetarian", "vegan"] },
} satisfies Record<string, Partial<RestaurantCandidate>>;

export type PlaceId = keyof typeof PLACES;

export function makePlace(id: string, extra: Partial<RestaurantCandidate> = {}): RestaurantCandidate {
  const base = (PLACES as Record<string, Partial<RestaurantCandidate>>)[id] ?? {};
  const cuisines = extra.cuisines ?? base.cuisines ?? [];
  return { id, category: "dinner", tags: [...cuisines], pricePerPerson: 20, stationId: "place-coecl", city: "Boston", ...base, ...extra, cuisines };
}

export const ALL_PLACES: RestaurantCandidate[] = Object.keys(PLACES).map((id) => makePlace(id));

export const COPLEY = { lat: 42.3500, lng: -71.0770 };

type CtxOverrides = {
  dietary?: string[];
  avoid?: string[];
  tastes?: string[];
  location?: { lat: number; lng: number } | null;
  start?: string | null;
  home?: string | null;
  ratings?: { placeId: string; score: number }[];
  wishlist?: string[];
  checkIns?: string[];
};

export function makeContext(o: CtxOverrides = {}, subjectId = "test-user"): UserContext {
  return userContextSchema.parse({
    version: 1,
    subjectId,
    kind: "user",
    generatedAt: "2026-11-20T23:00:00.000Z",
    preferences: { tastes: o.tastes ?? [], avoid: o.avoid ?? [], dietary: o.dietary ?? [], budgetPerPerson: null, maxWalkMinutes: null },
    stations: { home: o.home ?? null, start: o.start ?? null, homeLines: [] },
    location: o.location === undefined ? { ...COPLEY, nearestStationId: "place-coecl", accuracyM: 10, ageMinutes: 1 } : o.location && { ...o.location, nearestStationId: null, accuracyM: null, ageMinutes: 1 },
    time: { localHour: 18, minutesAfterMidnight: 1080, dayOfWeek: 5, isWeekend: false },
    history: { xp: 0, checkInCount: o.checkIns?.length ?? 0, daysSinceLastCheckIn: null, stampedStationIds: [], linesVisited: [], ratings: o.ratings ?? [], wishlistPlaceIds: o.wishlist ?? [], checkInPlaceIds: o.checkIns ?? [] },
    consent: { location: o.location !== null },
  });
}

// ------------------------------------------------------------- a synthetic city

const CUISINES = ["thai", "italian", "mexican", "chinese", "indian", "japanese", "korean", "american", "mediterranean", "vietnamese"];
const DIETS: Partial<RestaurantCandidate>[] = [
  { dietStyle: "mixed", dietary: ["vegetarian", "vegan"] },
  { dietStyle: "mixed", dietary: ["vegetarian"] },
  { dietStyle: "non-veg-only" },
  { dietStyle: "mixed" }, // unknown
  { dietStyle: "vegan-only" },
];

/** 50 Boston places (5 per cuisine) + a few in other cities. Deterministic. */
export function syntheticCity(): RestaurantCandidate[] {
  const out: RestaurantCandidate[] = [];
  CUISINES.forEach((c, ci) =>
    DIETS.forEach((d, di) =>
      out.push(
        makePlace(`${c}-${di}`, {
          cuisines: [c],
          city: "Boston",
          lat: 42.35 + ci * 0.002,
          lng: -71.06 - di * 0.002,
          rating: 3.6 + ((ci * 7 + di * 3) % 14) / 10,
          reviewCount: 100 + ((ci * 13 + di * 29) % 900),
          ...d,
        }),
      ),
    ),
  );
  out.push(makePlace("nyc-thai", { cuisines: ["thai"], city: "New York", rating: 5, reviewCount: 9000, dietStyle: "vegan-only" }));
  out.push(makePlace("cam-thai", { cuisines: ["thai"], city: "Cambridge", rating: 5, reviewCount: 9000, dietStyle: "vegan-only" }));
  return out;
}

