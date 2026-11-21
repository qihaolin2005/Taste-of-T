// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET /api/vehicles -> { vehicles, source: "live" | "stale" | "unavailable", fetchedAt }
// Live T train positions, cached server-side for 10 s. Never errors: the map degrades to static.
import { connection } from "next/server";
import { getVehicles } from "@/lib/mbta/vehicles";

export async function GET() {
  await connection(); // always run at request time, never prerendered at build
  const result = await getVehicles();
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
