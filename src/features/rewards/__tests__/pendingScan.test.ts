import { beforeEach, describe, expect, it, vi } from "vitest";
import { savePendingScan, takePendingScan, type ScannedReceipt } from "@/features/rewards/client";

const NOW = new Date("2026-11-21T23:30:00Z").getTime();
const scan = (minutesLeft: number): ScannedReceipt => ({
  receipt: { merchantName: "LANTERN DUMPLING", total: 48.2, date: "2026-11-21T23:05:00.000Z", diners: 2 },
  receiptToken: "token.sig",
  expiresAt: new Date(NOW + minutesLeft * 60_000).toISOString(),
});

describe("a receipt snapped after a trip, picked up by the claim screen", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it("hands the scan over once, for the same place", () => {
    savePendingScan("p1", scan(25));
    expect(takePendingScan("p1", NOW)).toEqual(scan(25));
    expect(takePendingScan("p1", NOW)).toBeNull(); // used once
  });

  it("drops it for a different place, or when it's (nearly) expired", () => {
    savePendingScan("p1", scan(25));
    expect(takePendingScan("p2", NOW)).toBeNull();
    savePendingScan("p1", scan(0.5)); // under the 1-minute margin
    expect(takePendingScan("p1", NOW)).toBeNull();
    expect(takePendingScan(null, NOW)).toBeNull();
  });

  it("works without storage (private mode): nothing saved, nothing thrown", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(() => savePendingScan("p1", scan(25))).not.toThrow();
    expect(takePendingScan("p1", NOW)).toBeNull();
  });
});
