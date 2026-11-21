import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const okBody = {
  data: [
    {
      id: "R-1",
      type: "vehicle",
      attributes: { latitude: 42.35, longitude: -71.06, bearing: 90, current_status: "STOPPED_AT", direction_id: 1, label: "1500", updated_at: "2026-11-21T12:00:00-05:00" },
      relationships: { route: { data: { id: "Red", type: "route" } }, stop: { data: { id: "70077", type: "stop" } } },
    },
  ],
};

// vehicles.ts keeps a module-level cache, so load a fresh copy per test.
async function load() {
  vi.resetModules();
  return import("@/lib/mbta/vehicles");
}

describe("getVehicles", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("maps MBTA vehicles to map-friendly objects", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(okBody)));
    const { getVehicles } = await load();
    const r = await getVehicles();
    expect(r.source).toBe("live");
    expect(r.vehicles[0]).toMatchObject({ id: "R-1", routeId: "Red", lat: 42.35, lng: -71.06, bearing: 90, stopId: "70077" });
  });

  it("serves from cache within 10s (one MBTA call for many users)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(okBody)));
    const { getVehicles } = await load();
    await Promise.all([getVehicles(), getVehicles(), getVehicles()]);
    await getVehicles();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the last good data when MBTA fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(okBody)));
    const { getVehicles } = await load();
    await getVehicles();
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const r = await getVehicles(Date.now() + 60_000);
    expect(r.source).toBe("stale");
    expect(r.vehicles).toHaveLength(1);
  });

  it("returns an empty, unavailable result when MBTA has never answered", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));
    const { getVehicles } = await load();
    expect(await getVehicles()).toEqual({ vehicles: [], source: "unavailable", fetchedAt: null });
  });
});
