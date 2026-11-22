import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { getOrCreateUser } from "@/features/users";
import { checkIn } from "@/features/gamification/checkin";
import { bostonLocalToIso, claimVisit, resolveClaim, RewardError, signReceipt, verifyReceipt, type ClaimRequest, type ReceiptFacts } from "@/features/rewards";
import { geminiErrorStatus, parseReading, toReceiptFacts, type ReceiptReading } from "@/features/rewards/receiptOcr";

const NOW = new Date("2026-11-21T23:30:00Z"); // 6:30 pm in Boston
const SECRET = "test-secret";
const PLACE = { lat: 42.3505, lng: -71.0621 }; // Chinatown
/** ~100 m north of PLACE. */
const NEARBY = { lat: 42.3514, lng: -71.0621 };
/** Harvard Square, ~5 km away. */
const FAR = { lat: 42.3736, lng: -71.1189 };

const FACTS: ReceiptFacts = { total: 48.2, date: "2026-11-21T23:05:00.000Z", merchantName: "LANTERN DUMPLING HSE", receiptNumber: "CHK-1042" };

const expectReward = (fn: () => unknown, code: string, msg?: RegExp) => {
  let err: unknown = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(RewardError);
  expect((err as RewardError).code).toBe(code);
  if (msg) expect((err as RewardError).message).toMatch(msg);
};

describe("GPS check-in", () => {
  it("passes at the place and within the radius", () => {
    expect(checkIn(PLACE, PLACE)).toEqual({ ok: true, distanceM: 0 });
    expect(checkIn({ ...NEARBY, accuracyM: 20 }, PLACE).ok).toBe(true);
  });

  it("fails from across town, saying how far", () => {
    const r = checkIn({ ...FAR, accuracyM: 10 }, PLACE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("too_far");
      expect(r.message).toMatch(/mi away/);
    }
  });

  it("allows some GPS error, but only up to the slack", () => {
    const at200m = { lat: 42.3523, lng: -71.0621 };
    expect(checkIn({ ...at200m, accuracyM: 10 }, PLACE).ok).toBe(false); // 200 m > 150 + 10
    expect(checkIn({ ...at200m, accuracyM: 60 }, PLACE).ok).toBe(true); // 200 m <= 150 + 60
    expect(checkIn({ ...FAR, accuracyM: 400 }, PLACE).ok).toBe(false); // slack is capped at 75 m
  });

  it("refuses a fix too rough to prove anything", () => {
    const r = checkIn({ ...PLACE, accuracyM: 2000 }, PLACE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_rough");
  });
});

describe("receipt token", () => {
  it("round-trips the facts for the same user", () => {
    const { token } = signReceipt("u1", FACTS, SECRET, NOW);
    expect(verifyReceipt(token, "u1", SECRET, NOW)).toEqual({ ok: true, facts: FACTS });
  });

  it("rejects an edited total", () => {
    const { token } = signReceipt("u1", FACTS, SECRET, NOW);
    const [body, sig] = token.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    payload.f.total = 480.2;
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
    expect(verifyReceipt(forged, "u1", SECRET, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects another user's scan, an expired scan, and a different secret", () => {
    const { token } = signReceipt("u1", FACTS, SECRET, NOW);
    expect(verifyReceipt(token, "u2", SECRET, NOW)).toEqual({ ok: false, reason: "not_yours" });
    expect(verifyReceipt(token, "u1", SECRET, new Date(NOW.getTime() + 31 * 60_000))).toEqual({ ok: false, reason: "expired" });
    expect(verifyReceipt(token, "u1", "other", NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyReceipt("garbage", "u1", SECRET, NOW)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("reading a receipt", () => {
  it("turns Boston local time into UTC, in winter and summer", () => {
    expect(bostonLocalToIso("2026-11-21T19:42")).toBe("2026-11-22T00:42:00.000Z"); // EST, -5
    expect(bostonLocalToIso("2026-07-04T19:42")).toBe("2026-07-04T23:42:00.000Z"); // EDT, -4
    expect(bostonLocalToIso("21/11/2026 7:42pm")).toBeNull();
    expect(bostonLocalToIso("2026-13-01T10:00")).toBeNull();
  });

  const reading: ReceiptReading = { isReceipt: true, merchantName: " LANTERN DUMPLING HSE ", total: 48.199, dateTime: "2026-11-21T18:05", receiptNumber: "CHK-1042", guests: 2 };

  it("keeps what was read, cleaned up", () => {
    expect(toReceiptFacts(reading)).toEqual({
      facts: { total: 48.2, date: "2026-11-21T23:05:00.000Z", merchantName: "LANTERN DUMPLING HSE", receiptNumber: "CHK-1042", diners: 2 },
    });
  });

  it("only accepts the JSON shape we asked Gemini for", () => {
    expect(parseReading(JSON.stringify(reading))).toEqual(reading);
    expect(parseReading(undefined)).toBeNull();
    expect(parseReading("Sure! Here is the receipt: {")).toBeNull();
    expect(parseReading(JSON.stringify({ ...reading, total: "48.20" }))).toBeNull(); // wrong type
    expect(parseReading(JSON.stringify({ isReceipt: true }))).toBeNull(); // missing fields
  });

  it("reads the HTTP status off SDK errors", () => {
    expect(geminiErrorStatus(Object.assign(new Error("quota"), { status: 429 }))).toBe(429);
    expect(geminiErrorStatus(new Error("network"))).toBeNull();
    expect(geminiErrorStatus(null)).toBeNull();
  });

  it("says what it couldn't read instead of guessing", () => {
    const r = toReceiptFacts({ ...reading, merchantName: null, total: null });
    expect("error" in r && r.error.code).toBe("unreadable");
    expect("error" in r && r.error.message).toMatch(/restaurant name, total/);
    expect(toReceiptFacts({ ...reading, isReceipt: false })).toMatchObject({ error: { code: "not_a_receipt" } });
    expect(toReceiptFacts({ ...reading, guests: 40 })).toMatchObject({ facts: { total: 48.2 } }); // silly guest count dropped
    expect("diners" in (toReceiptFacts({ ...reading, guests: 40 }) as { facts: object }).facts).toBe(false);
  });
});

describe("resolveClaim", () => {
  const base = (extra: Partial<ClaimRequest> = {}): ClaimRequest => ({ placeId: "p1", location: { ...NEARBY, accuracyM: 15 }, ...extra });
  const ctx = (extra: Partial<Parameters<typeof resolveClaim>[2]> = {}) => ({ placeCoords: PLACE, secret: SECRET, requireReceiptScan: true, now: NOW, ...extra });

  it("uses the scanned facts, with the diners the user picked", () => {
    const { token } = signReceipt("u1", { ...FACTS, diners: 2 }, SECRET, NOW);
    const r = resolveClaim("u1", base({ receiptToken: token, diners: 3 }), ctx());
    expect(r.input).toEqual({ placeId: "p1", receipt: { ...FACTS, diners: 3 } });
    expect(r.checkInDistanceM).toBeGreaterThan(50);
  });

  it("ignores a typed receipt when a scan is sent", () => {
    const { token } = signReceipt("u1", FACTS, SECRET, NOW);
    const r = resolveClaim("u1", base({ receiptToken: token, receipt: { total: 1999, date: FACTS.date } }), ctx());
    expect(r.input.receipt.total).toBe(48.2);
  });

  it("refuses a claim from away from the restaurant", () => {
    const { token } = signReceipt("u1", FACTS, SECRET, NOW);
    expectReward(() => resolveClaim("u1", base({ receiptToken: token, location: FAR }), ctx()), "forbidden", /at the restaurant/);
  });

  it("refuses when the place can't be located", () => {
    const { token } = signReceipt("u1", FACTS, SECRET, NOW);
    expectReward(() => resolveClaim("u1", base({ receiptToken: token }), ctx({ placeCoords: null })), "bad_request");
  });

  it("requires a scan when scanning is on; accepts typed only when it's off", () => {
    const typed = base({ receipt: { total: 30, date: FACTS.date } });
    expectReward(() => resolveClaim("u1", typed, ctx()), "bad_request", /Scan your receipt/);
    expect(resolveClaim("u1", typed, ctx({ requireReceiptScan: false })).input.receipt.total).toBe(30);
    expectReward(() => resolveClaim("u1", base(), ctx({ requireReceiptScan: false })), "bad_request");
  });

  it("refuses someone else's or an expired scan", () => {
    const { token } = signReceipt("u2", FACTS, SECRET, NOW);
    expectReward(() => resolveClaim("u1", base({ receiptToken: token }), ctx()), "bad_request", /isn't valid/);
    const old = signReceipt("u1", FACTS, SECRET, new Date(NOW.getTime() - 40 * 60_000)).token;
    expectReward(() => resolveClaim("u1", base({ receiptToken: old }), ctx()), "bad_request", /expired/);
  });
});

describe("a scanned claim end to end", () => {
  const db = createTestDb();
  afterAll(() => db.$disconnect());

  it("pays on the scanned total, and the scanned name must match the place", async () => {
    const u = (await getOrCreateUser(db, null)).user.id;
    await db.recommendationShown.create({ data: { userId: u, placeId: "p-lantern", shownAt: NOW } });
    const { token } = signReceipt(u, FACTS, SECRET, NOW);
    const req: ClaimRequest = { placeId: "p-lantern", location: NEARBY, receiptToken: token };
    const c = { placeCoords: PLACE, secret: SECRET, requireReceiptScan: true, now: NOW };

    const wrongPlace = claimVisit(db, u, resolveClaim(u, req, c).input, { now: NOW, placeName: "Golden Garden" });
    await expect(wrongPlace).rejects.toThrow(/doesn't look like it's from Golden Garden/);

    const ok = await claimVisit(db, u, resolveClaim(u, req, c).input, { now: NOW, placeName: "Lantern Dumpling House" });
    expect(ok.breakdown.spend).toBe(24.1); // $48.20 scanned, 1 point per $2
  });
});
