// Owner: P2 - Data & Integrations (see TEAM.md)
// Google Places (New) result -> our Place (the ML RestaurantCandidate shape + hours).
// Pure functions, unit-tested with recorded-style fixtures.
import { nearestStation, walkMinutes } from "@/lib/geo";
import type { StationRecord } from "@/lib/mbta/stations";
import type { DietStyle } from "@/features/ml/recommend/restaurant";
import { fromGooglePeriods, isLateNight, type GooglePeriod } from "./hours";
import type { Place, PlaceCategory } from "./types";

/** Fields we ask Google for. Each one affects the price of the request (see README). */
export type GooglePlace = {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  formattedAddress?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  priceRange?: { startPrice?: { units?: string }; endPrice?: { units?: string } };
  regularOpeningHours?: { periods?: GooglePeriod[] };
  servesVegetarianFood?: boolean;
};

/** Google place type -> our cuisine/activity tag (TASTE_VOCAB). */
const TYPE_TO_TAG: Record<string, string> = {
  american_restaurant: "american",
  bakery: "bakery",
  barbecue_restaurant: "bbq",
  breakfast_restaurant: "brunch",
  brunch_restaurant: "brunch",
  hamburger_restaurant: "burgers",
  cafe: "cafe",
  coffee_shop: "cafe",
  chinese_restaurant: "chinese",
  dessert_shop: "dessert",
  dessert_restaurant: "dessert",
  confectionery: "dessert",
  ice_cream_shop: "ice-cream",
  indian_restaurant: "indian",
  italian_restaurant: "italian",
  japanese_restaurant: "japanese",
  korean_restaurant: "korean",
  mediterranean_restaurant: "mediterranean",
  greek_restaurant: "mediterranean",
  middle_eastern_restaurant: "mediterranean",
  lebanese_restaurant: "mediterranean",
  mexican_restaurant: "mexican",
  pizza_restaurant: "pizza",
  ramen_restaurant: "ramen",
  sandwich_shop: "sandwiches",
  seafood_restaurant: "seafood",
  sushi_restaurant: "sushi",
  thai_restaurant: "thai",
  vegan_restaurant: "vegan-friendly",
  vegetarian_restaurant: "vegan-friendly",
  vietnamese_restaurant: "vietnamese",
  bowling_alley: "bowling",
  karaoke: "karaoke",
  comedy_club: "comedy",
  video_arcade: "arcade",
  amusement_center: "arcade",
  museum: "museum",
  art_gallery: "museum",
  park: "outdoors",
  night_club: "live-music",
};

const DESSERT_TYPES = new Set(["dessert_shop", "dessert_restaurant", "ice_cream_shop", "bakery", "cafe", "coffee_shop", "confectionery"]);
const ACTIVITY_TYPES = new Set(["bowling_alley", "karaoke", "comedy_club", "video_arcade", "amusement_center", "museum", "art_gallery", "park", "night_club", "movie_theater"]);

/** Typical spend per person when Google gives a price level but no range. */
const LEVEL_PRICE: Record<string, { level?: number; usd: number }> = {
  PRICE_LEVEL_FREE: { usd: 0 },
  PRICE_LEVEL_INEXPENSIVE: { level: 1, usd: 12 },
  PRICE_LEVEL_MODERATE: { level: 2, usd: 25 },
  PRICE_LEVEL_EXPENSIVE: { level: 3, usd: 50 },
  PRICE_LEVEL_VERY_EXPENSIVE: { level: 4, usd: 85 },
};
/** When Google has no price info at all. */
const DEFAULT_PRICE: Record<PlaceCategory, number> = { dinner: 25, dessert: 9, activity: 20 };

export function categoryOf(types: readonly string[], hint?: PlaceCategory): PlaceCategory {
  if (types.some((t) => ACTIVITY_TYPES.has(t))) return "activity";
  if (types.includes("restaurant") || types.some((t) => t.endsWith("_restaurant") && !DESSERT_TYPES.has(t))) {
    return hint === "dessert" && types.some((t) => DESSERT_TYPES.has(t)) ? "dessert" : "dinner";
  }
  if (types.some((t) => DESSERT_TYPES.has(t))) return "dessert";
  return hint ?? "dinner";
}

function priceOf(g: GooglePlace, category: PlaceCategory): { pricePerPerson: number; priceLevel?: number } {
  const lo = Number(g.priceRange?.startPrice?.units);
  const hi = Number(g.priceRange?.endPrice?.units);
  const level = g.priceLevel ? LEVEL_PRICE[g.priceLevel] : undefined;
  if (Number.isFinite(lo) && lo >= 0) {
    return { pricePerPerson: Math.round(Number.isFinite(hi) && hi > lo ? (lo + hi) / 2 : lo * 1.25), priceLevel: level?.level };
  }
  if (level) return { pricePerPerson: level.usd, priceLevel: level.level };
  return { pricePerPerson: DEFAULT_PRICE[category] };
}

/**
 * What Google tells us about diets is thin: a `servesVegetarianFood` flag and vegan/vegetarian
 * restaurant types. Nothing on halal/kosher/allergies, so those stay unknown (and, per the ML
 * contract, such places are hidden from people with those restrictions).
 */
function dietOf(g: GooglePlace, types: readonly string[]): { dietStyle?: DietStyle; dietary?: string[] } {
  if (types.includes("vegan_restaurant")) return { dietStyle: "vegan-only", dietary: ["vegan", "vegetarian", "dairy-free"] };
  if (types.includes("vegetarian_restaurant")) return { dietStyle: "veg-only", dietary: ["vegetarian"] };
  if (g.servesVegetarianFood === true) return { dietStyle: "mixed", dietary: ["vegetarian"] };
  if (g.servesVegetarianFood === false) return { dietStyle: "non-veg-only", dietary: [] };
  return {};
}

/** "1 Brattle St, Cambridge, MA 02138, USA" -> "Cambridge". */
export function cityFromAddress(address: string | undefined): string | undefined {
  const parts = address?.split(",").map((s) => s.trim()) ?? [];
  const stateIdx = parts.findIndex((p) => /^MA\b/.test(p));
  return stateIdx > 0 ? parts[stateIdx - 1] : undefined;
}

export type MapContext = {
  stations: readonly StationRecord[];
  /** Category we searched for, used to break ties (a bakery-café in a dessert search is dessert). */
  categoryHint?: PlaceCategory;
  /** Fallbacks from the hub we searched around. */
  hub?: { stationId: string; city: string; neighborhood: string };
};

/** Returns null for places we shouldn't show (closed for good, no location). */
export function mapGooglePlace(g: GooglePlace, ctx: MapContext): Place | null {
  if (!g.location || !g.displayName?.text) return null;
  if (g.businessStatus && g.businessStatus !== "OPERATIONAL") return null;

  const types = g.types ?? (g.primaryType ? [g.primaryType] : []);
  const category = categoryOf(types, ctx.categoryHint);
  const point = { lat: g.location.latitude, lng: g.location.longitude };
  const near = nearestStation(point, ctx.stations, 2500);
  const stationId = near?.station.id ?? ctx.hub?.stationId;
  if (!stationId) return null;
  const station = near?.station ?? ctx.stations.find((s) => s.id === stationId);

  const hours = fromGooglePeriods(g.regularOpeningHours?.periods);
  const tags = [...new Set(types.map((t) => TYPE_TO_TAG[t]).filter((t): t is string => !!t))];
  if (isLateNight(hours)) tags.push("late-night");
  const { pricePerPerson, priceLevel } = priceOf(g, category);
  const { dietStyle, dietary } = dietOf(g, types);

  return {
    id: `google:${g.id}`, // Google place ids are stable and may be stored
    name: g.displayName.text.slice(0, 120),
    category,
    tags,
    cuisines: tags,
    pricePerPerson,
    ...(priceLevel ? { priceLevel } : {}),
    stationId,
    lat: point.lat,
    lng: point.lng,
    walkMinutes: station ? walkMinutes(station, point) : 0,
    city: cityFromAddress(g.formattedAddress) ?? ctx.hub?.city,
    ...(ctx.hub && near?.station.id === ctx.hub.stationId ? { neighborhood: ctx.hub.neighborhood } : {}),
    ...(g.rating != null ? { rating: Math.min(5, Math.max(0, g.rating)) } : {}),
    ...(g.userRatingCount != null ? { reviewCount: g.userRatingCount } : {}),
    ...(dietStyle ? { dietStyle } : {}),
    ...(dietary ? { dietary } : {}),
    ...(hours ? { hours } : {}),
    ...(g.formattedAddress ? { address: g.formattedAddress } : {}),
    ...(g.googleMapsUri ? { mapsUrl: g.googleMapsUri } : {}),
    source: "google",
  };
}
