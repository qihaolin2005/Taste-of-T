import { describe, expect, it } from "vitest";
import { merchantMatches } from "@/features/rewards";
import { loadSeedRestaurants } from "@/features/ml";

// How each restaurant's name tends to look at the top of a printed receipt (caps, shorthand,
// store numbers, a dropped word), keyed by the place's real name.
const RECEIPTS: Record<string, string> = {
  "Beacon Kosher Deli": "BEACON KOSHER DELI LLC",
  "Boylston Burger Club": "BOYLSTON BURGER CLUB #2",
  "Brattle Noodle Shop": "Brattle Noodle",
  "Cannoli Corner": "CANNOLI CORNER - NORTH END",
  "Chinatown Dessert Hall": "CHINATOWN DESSERT HALL",
  "Common Ground Greens": "COMMON GROUND GREENS",
  "Copley Ramen Bar": "Copley Ramen",
  "Crossing Pizza Co.": "CROSSING PIZZA CO",
  "Davis Square Tacos": "DAVIS SQ TACOS",
  "Golden Wok Hot Pot": "GOLDEN WOK HOT POT INC",
  "Harvard Square Bhavan": "HARVARD SQ BHAVAN",
  "Holland Ave Creamery": "HOLLAND AVE CREAMERY",
  "Kendall Thai Garden": "KENDALL THAI",
  "Kenmore Taqueria": "KENMORE TAQUERIA #1",
  "Lantern Dumpling House": "LANTERN DUMPLING HSE #2",
  "Late Night Falafel": "LATE NITE FALAFEL",
  "Mass Ave Momo": "MASS AVE MOMO",
  "Moonlight Vegan Bakery": "MOONLIGHT VEGAN BKRY",
  "Night Market Pho": "NIGHT MARKET PHO",
  "Pearl Tea Bar": "PEARL TEA BAR",
  "Saffron Halal Grill": "SAFFRON HALAL GRL",
  "Square Crepe Cafe": "SQUARE CREPE CAFE",
  "Sweet Lab Gelato": "SWEET LAB GELATO",
  "Wharf Fish House": "WHARF FISH HSE",
  "Hanover Trattoria": "HANOVER TRATTORIA",
};

const places = loadSeedRestaurants().places.filter((p) => p.category !== "activity" && p.name);

describe("receipt name vs the recommended restaurant", () => {
  it("every restaurant's own receipt matches it", () => {
    for (const p of places) {
      const receipt = RECEIPTS[p.name!];
      expect(receipt, `no sample receipt for ${p.name}`).toBeDefined();
      expect(merchantMatches(receipt, p.name!), `${receipt} -> ${p.name}`).toBe(true);
    }
  });

  it("no restaurant's receipt passes for a different one of ours", () => {
    const wrong: string[] = [];
    for (const p of places) for (const other of places) if (other !== p && merchantMatches(RECEIPTS[p.name!], other.name!)) wrong.push(`${RECEIPTS[p.name!]} -> ${other.name}`);
    expect(wrong).toEqual([]);
  });

  it("receipts from other restaurants that share a common word are refused", () => {
    const cases: [string, string][] = [
      ["TACO BELL #1234", "Davis Square Tacos"],
      ["GOLDEN DUMPLING", "Lantern Dumpling House"],
      ["NIGHT OWL DINER", "Night Market Pho"],
      ["HARVARD SQ PIZZA", "Davis Square Tacos"],
      ["THAI GARDEN EXPRESS", "Kendall Thai Garden"],
      ["THE KITCHEN", "Hanover Trattoria"],
      ["Starbucks #1234", "Lantern Dumpling House"],
      ["MOMO HOUSE", "Mass Ave Momo"],
      ["FISH HOUSE GRILL", "Wharf Fish House"],
      ["LATE NIGHT PIZZA", "Late Night Falafel"],
    ];
    for (const [receipt, place] of cases) expect(merchantMatches(receipt, place), `${receipt} -> ${place}`).toBe(false);
  });

  it("tolerates receipt shorthand and a one-letter OCR slip, but not a mere prefix", () => {
    expect(merchantMatches("LANTRN DUMPLING", "Lantern Dumpling House")).toBe(true); // one letter dropped
    expect(merchantMatches("LNTRN DUMPLING", "Lantern Dumpling House")).toBe(false); // two letters off
    expect(merchantMatches("LANTEM DUMPLING", "Lantern Dumpling House")).toBe(true); // OCR read rn as m
    expect(merchantMatches("SAFFRON HALAL GRILL & KABOB", "Saffron Halal Grill")).toBe(true);
    expect(merchantMatches("LANT", "Lantern Dumpling House")).toBe(false);
    expect(merchantMatches("", "Lantern Dumpling House")).toBe(false);
  });
});
