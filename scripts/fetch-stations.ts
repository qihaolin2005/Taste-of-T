// Owner: P2 - Data & Integrations (see TEAM.md)
// One-off: pull subway stations, lines, and route shapes from the MBTA V3 API into
// data/stations.json. The app reads that snapshot, so the map works offline.
//   npm run stations
// Makes 17 requests; without MBTA_API_KEY it waits out the 20/min limit if needed.
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { distanceMeters } from "../src/lib/geo";
import { MbtaError, mbtaGet } from "../src/lib/mbta/client";
import { decodePolyline } from "../src/lib/polyline";

const ROUTES = ["Red", "Mattapan", "Orange", "Blue", "Green-B", "Green-C", "Green-D", "Green-E"];

type RouteAttrs = { color: string; long_name: string };
type StopAttrs = { name: string; latitude: number; longitude: number };
type ShapeAttrs = { polyline: string };

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<A>(path: string, params: Record<string, string>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mbtaGet<A>(path, params, { timeoutMs: 15_000 });
    } catch (err) {
      if (err instanceof MbtaError && err.status === 429) {
        const waitMs = err.resetAt ? Math.max(1000, err.resetAt * 1000 - Date.now() + 1000) : 61_000;
        console.log(`  rate limited, waiting ${Math.ceil(waitMs / 1000)}s...`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Gave up on ${path}`);
}

/**
 * MBTA returns many shape variants per route (short turns, both directions).
 * Keep "canonical-*" shapes, and drop one that is just another shape reversed.
 */
function pickShapes(shapes: { id: string; attributes: ShapeAttrs }[]): string[] {
  const canonical = shapes.filter((s) => s.id.startsWith("canonical-"));
  const pool = canonical.length ? canonical : shapes;
  const kept: { encoded: string; start: { lat: number; lng: number }; end: { lat: number; lng: number } }[] = [];
  for (const s of pool) {
    const pts = decodePolyline(s.attributes.polyline);
    if (pts.length < 2) continue;
    const start = pts[0];
    const end = pts[pts.length - 1];
    const isReverse = kept.some((k) => distanceMeters(k.start, end) < 300 && distanceMeters(k.end, start) < 300);
    if (!isReverse) kept.push({ encoded: s.attributes.polyline, start, end });
  }
  return kept.map((k) => k.encoded);
}

async function main() {
  console.log("Fetching routes...");
  const routes = await get<RouteAttrs>("/routes", { "filter[id]": ROUTES.join(","), "fields[route]": "color,long_name" });
  const routeById = new Map(routes.map((r) => [r.id, r.attributes]));

  const stations = new Map<string, { id: string; name: string; lat: number; lng: number; lines: string[] }>();
  const lines = [];

  for (const routeId of ROUTES) {
    console.log(`Fetching ${routeId}...`);
    const stops = await get<StopAttrs>("/stops", {
      "filter[route]": routeId,
      "filter[direction_id]": "0", // returned in order along the line
      "fields[stop]": "name,latitude,longitude",
    });
    const shapes = await get<ShapeAttrs>("/shapes", { "filter[route]": routeId });

    for (const s of stops) {
      const existing = stations.get(s.id);
      if (existing) existing.lines.push(routeId);
      else stations.set(s.id, { id: s.id, name: s.attributes.name, lat: round5(s.attributes.latitude), lng: round5(s.attributes.longitude), lines: [routeId] });
    }

    const attrs = routeById.get(routeId);
    lines.push({
      id: routeId,
      name: attrs?.long_name ?? routeId,
      color: `#${attrs?.color ?? "888888"}`,
      stationIds: stops.map((s) => s.id),
      shapes: pickShapes(shapes),
    });
  }

  const out = {
    _source: "MBTA V3 API snapshot. Regenerate with `npm run stations`. Data: Massachusetts Bay Transportation Authority.",
    fetchedAt: new Date().toISOString(),
    lines,
    stations: [...stations.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
  await writeFile("data/stations.json", JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote data/stations.json: ${out.stations.length} stations, ${lines.length} lines, ${lines.reduce((n, l) => n + l.shapes.length, 0)} shapes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
