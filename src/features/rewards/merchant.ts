// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// "Is this receipt from the place we recommended?" Compares the restaurant name printed on the
// receipt (read by OCR, or typed) with the place's name.
//
// Sharing any one word isn't enough: "TACO BELL" shares "taco" with "Davis Square Tacos", and
// "GOLDEN DUMPLING" shares "dumpling" with "Lantern Dumpling House". So words are split in two:
//   - generic: food types, neighborhoods, "square", "night", "house"... many places share them
//   - distinctive: everything else ("lantern", "saffron", "crossing")
// A place with distinctive words matches only if the receipt has one of them. A place named only
// with generic words needs its neighborhood plus most of its name ("KENDALL THAI" yes, "THAI GARDEN
// EXPRESS" no, for "Kendall Thai Garden"), or with no neighborhood in it, the whole name ("LATE
// NITE FALAFEL" yes, "LATE NIGHT PIZZA" no, for "Late Night Falafel"). Receipt shorthand (HSE, SQ, AVE, NITE) is expanded first, and a one-letter OCR
// slip in a longer word is tolerated.

/** Dropped entirely: they say nothing about which place it is. */
const NOISE = new Set(["the", "and", "of", "llc", "inc", "co", "corp", "ltd", "restaurant", "restaurants", "est", "store", "location", "boston", "ma"]);

/** Shared by many places, so never enough on their own. */
const GENERIC = new Set([
  // kinds of place
  "kitchen", "cafe", "bar", "grill", "house", "shop", "club", "hall", "corner", "garden", "market", "deli", "diner", "bistro",
  "eatery", "express", "bakery", "creamery", "taqueria", "trattoria", "pizzeria", "cantina", "tavern", "pub", "lounge", "spot",
  // food
  "pizza", "taco", "tacos", "burger", "burgers", "noodle", "noodles", "dumpling", "dumplings", "ramen", "pho", "sushi", "thai",
  "chinese", "indian", "mexican", "italian", "korean", "japanese", "falafel", "halal", "kosher", "vegan", "gelato", "crepe",
  "crepes", "tea", "coffee", "dessert", "desserts", "momo", "fish", "seafood", "hot", "pot", "bbq", "wok", "greens", "salad",
  "sweet", "golden", "royal", "new", "best", "fresh", "late", "night", "street",
]);

/** Neighborhood / street words: generic across places, but in a name like "Kendall Thai Garden" they're what tells it apart from any "Thai Garden". */
const LOCATION = new Set([
  "square", "avenue", "harvard", "davis", "kendall", "central", "porter", "copley", "kenmore", "chinatown", "cambridge",
  "somerville", "brookline", "allston", "fenway", "downtown", "north", "south", "east", "west", "back", "bay", "mass",
]);
const isGeneric = (w: string) => GENERIC.has(w) || LOCATION.has(w);

/** Receipt shorthand -> the word in the place's name. */
const ABBREVIATIONS: Record<string, string> = {
  hse: "house", hs: "house", sq: "square", ave: "avenue", av: "avenue", st: "street", nite: "night", rest: "restaurant",
  rstrnt: "restaurant", kitch: "kitchen", ktchn: "kitchen", ctr: "center", mkt: "market", bros: "brothers", intl: "international",
  pz: "pizza", grl: "grill", bkry: "bakery", gdn: "garden",
};

export function nameWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .map((w) => ABBREVIATIONS[w] ?? w)
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !NOISE.has(w));
}

/** One edit (insert, delete, change) apart? */
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Same word, allowing a plural and (for longer words) one OCR slip. Never a mere prefix. */
function sameWord(placeWord: string, receiptWord: string): boolean {
  if (placeWord === receiptWord) return true;
  if (placeWord + "s" === receiptWord || receiptWord + "s" === placeWord) return true;
  if (placeWord.length < 5 || receiptWord.length < 5) return false;
  // OCR often reads "rn" as "m" ("LANTEM"): count that as the same letter.
  const ocr = (w: string) => w.replace(/rn/g, "m");
  return oneEdit(placeWord, receiptWord) || oneEdit(ocr(placeWord), ocr(receiptWord));
}

export function merchantMatches(receiptName: string, placeName: string): boolean {
  const receipt = nameWords(receiptName);
  const place = [...new Set(nameWords(placeName))];
  if (!place.length || !receipt.length) return false;
  const onReceipt = (w: string) => receipt.some((r) => sameWord(w, r));

  const distinctive = place.filter((w) => !isGeneric(w));
  if (distinctive.length) return distinctive.some(onReceipt);

  // Only generic words in the name. With a neighborhood in it ("Kendall Thai Garden"), that plus
  // most of the name will do ("KENDALL THAI"). Without one ("Late Night Falafel"), it's ambiguous
  // ("LATE NIGHT PIZZA"), so the whole name must be there.
  const location = place.filter((w) => LOCATION.has(w));
  const hits = place.filter(onReceipt).length;
  if (!location.length) return hits === place.length;
  if (!location.some(onReceipt)) return false;
  return hits >= Math.min(2, place.length) && hits / place.length >= 2 / 3;
}
