import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restaurantSchema } from "@/features/ml/recommend/restaurant";
import { loadRestaurants } from "@/features/ml/recommend/source";
import { loadSeedRestaurants } from "@/features/ml/recommend/seedPlaces";
import { getStations } from "@/lib/mbta/stations";
import { fromGooglePeriods, isLateNight, isOpenFor } from "@/lib/places/hours";
import { categoryOf, cityFromAddress, mapGooglePlace, type GooglePlace } from "@/lib/places/googleMapping";
import { FIELD_MASK } from "@/lib/places/google";
import { HUBS } from "@/lib/places/hubs";
import { clearPlacesCache, getSeedPlaces, listRestaurants, searchPlaces } from "@/lib/places";

const stations = getStations();

// Shaped like real Places API (New) responses for the fields we request.
const RAMEN: GooglePlace = {
  id: "ChIJramen123",
  displayName: { text: "Test Ramen" },
  location: { latitude: 42.3527, longitude: -71.0626 },
  types: ["ramen_restaurant", "japanese_restaurant", "restaurant", "food", "point_of_interest"],
  primaryType: "ramen_restaurant",
  formattedAddress: "10 Beach St, Boston, MA 02111, USA",
  googleMapsUri: "https://maps.google.com/?cid=1",
  businessStatus: "OPERATIONAL",
  rating: 4.6,
  userRatingCount: 1532,
  priceLevel: "PRICE_LEVEL_MODERATE",
  priceRange: { startPrice: { units: "20" }, endPrice: { units: "30" } },
  regularOpeningHours: {
    periods: [
      { open: { day: 5, hour: 11, minute: 30 }, close: { day: 6, hour: 2, minute: 0 } }, // Fri 11:30 - Sat 2:00
      { open: { day: 6, hour: 11, minute: 30 }, close: { day: 6, hour: 22, minute: 0 } },
    ],
  },
  servesVegetarianFood: true,
};
const VEGAN_BAKERY: GooglePlace = {
  id: "ChIJbakery",
  displayName: { text: "Plant Bakery" },
  location: { latitude: 42.3655, longitude: -71.1038 },
  types: ["vegan_restaurant", "bakery", "cafe", "restaurant"],
  formattedAddress: "500 Massachusetts Ave, Cambridge, MA 02139, USA",
  businessStatus: "OPERATIONAL",
  priceLevel: "PRICE_LEVEL_INEXPENSIVE",
};

describe("opening hours", () => {
  const hours = fromGooglePeriods(RAMEN.regularOpeningHours!.periods)!;

  it("keeps past-midnight closing on the night it belongs to", () => {
    expect(hours[5]).toEqual([{ open: 690, close: 1560 }]); // Fri 11:30 AM - 2:00 AM
    expect(hours[6]).toEqual([{ open: 690, close: 1320 }]);
  });

  it("answers 'open for the whole visit?', including after midnight", () => {
    expect(isOpenFor(hours, 5, 20 * 60, 60)).toBe(true); // Fri 8 PM for an hour
    expect(isOpenFor(hours, 5, 25 * 60, 30)).toBe(true); // Fri 1:00 AM (= Sat morning)
    expect(isOpenFor(hours, 6, 60, 30)).toBe(true); // same moment asked as Sat 1:00 AM
    expect(isOpenFor(hours, 5, 25 * 60 + 45, 30)).toBe(false); // runs past 2:00 AM close
    expect(isOpenFor(hours, 2, 20 * 60)).toBe(false); // closed Tuesdays
    expect(isOpenFor(undefined, 2, 20 * 60)).toBe(true); // unknown hours: don't hide it
  });

  it("handles 24/7 places and tags late-night ones", () => {
    const always = fromGooglePeriods([{ open: { day: 0, hour: 0 } }])!;
    expect(isOpenFor(always, 3, 4 * 60, 120)).toBe(true);
    expect(isLateNight(hours)).toBe(true);
    expect(isLateNight({ 1: [{ open: 600, close: 1260 }] })).toBe(false);
  });
});

describe("Google -> Place mapping", () => {
  it("maps a ramen shop: category, cuisines, price, rating, station, city, diet, link", () => {
    const p = mapGooglePlace(RAMEN, { stations })!;
    expect(p).toMatchObject({
      id: "google:ChIJramen123",
      name: "Test Ramen",
      category: "dinner",
      pricePerPerson: 25,
      priceLevel: 2,
      stationId: "place-chncl",
      city: "Boston",
      rating: 4.6,
      reviewCount: 1532,
      dietStyle: "mixed",
      dietary: ["vegetarian"],
      mapsUrl: "https://maps.google.com/?cid=1",
      source: "google",
    });
    expect(p.cuisines).toEqual(expect.arrayContaining(["ramen", "japanese", "late-night"]));
    expect(p.walkMinutes).toBeGreaterThan(0);
  });

  it("maps a vegan bakery as dessert in a dessert search, with vegan diet info", () => {
    const p = mapGooglePlace(VEGAN_BAKERY, { stations, categoryHint: "dessert" })!;
    expect(p).toMatchObject({ category: "dessert", dietStyle: "vegan-only", city: "Cambridge", stationId: "place-cntsq", pricePerPerson: 12, priceLevel: 1 });
    expect(p.dietary).toContain("vegan");
  });

  it("leaves diet unknown when Google doesn't say, and marks non-veg places", () => {
    expect(mapGooglePlace({ ...RAMEN, servesVegetarianFood: undefined }, { stations })!.dietStyle).toBeUndefined();
    expect(mapGooglePlace({ ...RAMEN, servesVegetarianFood: false }, { stations })!.dietStyle).toBe("non-veg-only");
  });

  it("drops permanently closed places and ones without a location", () => {
    expect(mapGooglePlace({ ...RAMEN, businessStatus: "CLOSED_PERMANENTLY" }, { stations })).toBeNull();
    expect(mapGooglePlace({ ...RAMEN, location: undefined }, { stations })).toBeNull();
  });

  it("picks categories from Google types", () => {
    expect(categoryOf(["bowling_alley", "point_of_interest"])).toBe("activity");
    expect(categoryOf(["ice_cream_shop", "food"])).toBe("dessert");
    expect(categoryOf(["thai_restaurant", "restaurant"])).toBe("dinner");
  });

  it("parses the city from an address", () => {
    expect(cityFromAddress("1 Brattle St, Cambridge, MA 02138, USA")).toBe("Cambridge");
    expect(cityFromAddress("nowhere")).toBeUndefined();
  });

  it("every mapped place satisfies the ML restaurant contract", () => {
    for (const g of [RAMEN, VEGAN_BAKERY]) expect(restaurantSchema.safeParse(mapGooglePlace(g, { stations })).success).toBe(true);
  });
});

describe("seed data (offline fallback)", () => {
  it("has demo places that all satisfy the ML restaurant contract", () => {
    const seed = getSeedPlaces();
    expect(seed.length).toBeGreaterThanOrEqual(30);
    const { places, skipped } = loadSeedRestaurants();
    expect(skipped).toBe(0);
    expect(places).toHaveLength(seed.length);
  });

  it("covers every category and gives restricted diets options", () => {
    const seed = getSeedPlaces();
    for (const c of ["dinner", "dessert", "activity"]) expect(seed.some((p) => p.category === c)).toBe(true);
    for (const d of ["vegetarian", "vegan", "halal", "kosher", "gluten-free"]) {
      expect(seed.some((p) => p.category === "dinner" && p.dietary?.includes(d))).toBe(true);
    }
  });

  it("uses real station ids", () => {
    const ids = new Set(stations.map((s) => s.id));
    for (const p of getSeedPlaces()) expect(ids.has(p.stationId)).toBe(true);
  });
});

describe("places client (Google stubbed)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const ok = (places: GooglePlace[]) => new Response(JSON.stringify({ places }));

  beforeEach(() => {
    clearPlacesCache();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("PLACES_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("without a key, searches the seed list (no Google call)", async () => {
    vi.stubEnv("PLACES_API_KEY", "");
    const r = await searchPlaces({ stationId: "place-chncl", category: "dinner" });
    expect(r.from).toBe("seed");
    expect(r.places.length).toBeGreaterThan(0);
    expect(r.places.every((p) => p.category === "dinner")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Nearby Search with the key, field mask, and a circle around the station", async () => {
    fetchMock.mockResolvedValue(ok([RAMEN]));
    const r = await searchPlaces({ stationId: "place-chncl", category: "dinner", radiusM: 600 });
    expect(r).toMatchObject({ from: "google" });
    expect(r.places[0].name).toBe("Test Ramen");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "test-key", "x-goog-fieldmask": FIELD_MASK });
    expect(JSON.parse(init.body)).toMatchObject({ includedTypes: ["restaurant"], locationRestriction: { circle: { radius: 600 } } });
  });

  it("uses Text Search for free text, and caches repeated searches", async () => {
    fetchMock.mockResolvedValue(ok([RAMEN]));
    await searchPlaces({ stationId: "place-chncl", text: "ramen" });
    await searchPlaces({ stationId: "place-chncl", text: "ramen" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("places:searchText");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).textQuery).toBe("ramen");
  });

  it("falls back to the seed list with Google's error message when Google fails", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }));
    const r = await searchPlaces({ stationId: "place-harsq", category: "dinner" });
    expect(r.from).toBe("seed");
    expect(r.warning).toContain("API key not valid");
    expect(r.places.length).toBeGreaterThan(0);
  });

  it("listRestaurants searches every hub and category, merging duplicates", async () => {
    fetchMock.mockImplementation(async () => ok([RAMEN, VEGAN_BAKERY]));
    const places = (await listRestaurants({ signal: new AbortController().signal })) as unknown[];
    expect(fetchMock).toHaveBeenCalledTimes(HUBS.length * 3);
    expect(places).toHaveLength(2); // same two places came back from every hub
  });

  it("listRestaurants keeps going when some hubs fail, and fails only if all do", async () => {
    let n = 0;
    fetchMock.mockImplementation(async () => (n++ % 2 ? new Response("{}", { status: 500 }) : ok([RAMEN])));
    expect(await listRestaurants({ signal: new AbortController().signal })).toHaveLength(1);

    clearPlacesCache();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 403 }));
    await expect(listRestaurants({ signal: new AbortController().signal })).rejects.toThrow("403");
  });

  it("plugs into the recommender's loader: Google data when it works, seed when it doesn't", async () => {
    fetchMock.mockImplementation(async () => ok([RAMEN, VEGAN_BAKERY]));
    const live = await loadRestaurants(listRestaurants);
    expect(live).toMatchObject({ from: "source", skipped: 0 });
    expect(live.places.map((p) => p.id).sort()).toEqual(["google:ChIJbakery", "google:ChIJramen123"]);

    clearPlacesCache();
    vi.stubEnv("PLACES_API_KEY", "");
    const offline = await loadRestaurants(listRestaurants);
    expect(offline.from).toBe("seed");
    expect(offline.places.length).toBe(getSeedPlaces().length);
    expect(offline.warnings.join(" ")).toContain("PLACES_API_KEY");
  });

  it("a slow cold start falls back to seed once, then serves Google from cache", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fetchMock.mockImplementation(async () => {
      await gate;
      return ok([RAMEN]);
    });
    const first = await loadRestaurants(listRestaurants, { timeoutMs: 20 });
    expect(first.from).toBe("seed");
    release();
    await new Promise((r) => setTimeout(r, 20));
    const second = await loadRestaurants(listRestaurants, { timeoutMs: 20 });
    expect(second.from).toBe("source");
    expect(fetchMock).toHaveBeenCalledTimes(HUBS.length * 3); // the background fetch, not a second one
  });
});
