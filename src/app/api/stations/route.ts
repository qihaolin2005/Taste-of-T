// Owner: P2 - Data & Integrations (see TEAM.md)
//   GET /api/stations -> { stations, lines, fetchedAt }  (static MBTA snapshot, offline-safe)
import { getLines, getStations, stationsSnapshotDate } from "@/lib/mbta/stations";

export function GET() {
  return Response.json({ stations: getStations(), lines: getLines(), fetchedAt: stationsSnapshotDate });
}
