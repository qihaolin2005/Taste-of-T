import { afterEach, describe, expect, it, vi } from "vitest";
import { merchantMatches } from "../merchant";
import { demoReceiptFacts, demoReceipts, receiptScanEnabled } from "../receiptOcr";
import { receiptFactsSchema, signReceipt, verifyReceipt } from "../receiptToken";

afterEach(() => vi.unstubAllEnvs());

describe("demo receipts (DEMO_RECEIPTS=1)", () => {
  it("is off unless turned on, and turns scanning on without a Gemini key", () => {
    vi.stubEnv("DEMO_RECEIPTS", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(demoReceipts()).toBe(false);
    expect(receiptScanEnabled()).toBe(false);
    vi.stubEnv("DEMO_RECEIPTS", "1");
    expect(demoReceipts()).toBe(true);
    expect(receiptScanEnabled()).toBe(true);
  });

  it("makes a valid receipt from the claimed restaurant, dated now, that signs and verifies", () => {
    const now = new Date("2026-11-22T23:30:00Z");
    const facts = demoReceiptFacts("Neptune Oyster", now, () => 0.5);
    expect(receiptFactsSchema.safeParse(facts).success).toBe(true);
    expect(facts).toMatchObject({ merchantName: "Neptune Oyster", total: 42, date: now.toISOString() });
    expect(merchantMatches(facts.merchantName, "Neptune Oyster")).toBe(true);
    const { token } = signReceipt("u1", facts, "secret", now);
    expect(verifyReceipt(token, "u1", "secret", now)).toEqual({ ok: true, facts });
  });

  it("gives each demo receipt its own number, so it can be claimed again next demo", () => {
    const a = demoReceiptFacts("X", new Date("2026-11-22T23:30:00Z"));
    const b = demoReceiptFacts("X", new Date("2026-11-22T23:31:00Z"));
    expect(a.receiptNumber).not.toBe(b.receiptNumber);
    expect(demoReceiptFacts(null).merchantName).toBe("Demo Restaurant");
  });
});
