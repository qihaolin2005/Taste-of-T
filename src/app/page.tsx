// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Home (Figma Home layout): greeting, real stats, today's missions, Spin / Start a Night,
// points. The layout lives in components/home/HomeScreen; this page supplies station data.
import HomeScreen, { type HomeStation } from "@/components/home/HomeScreen";
import { Screen } from "@/components/shared/ios";
import { getStations } from "@/lib/mbta/stations";

/** Green-B..E count as one Green Line; Mattapan is part of the Red Line. */
function lineFamily(line: string): string {
  if (line.startsWith("Green")) return "Green";
  if (line === "Mattapan") return "Red";
  return line;
}

// Static station data (prerendered): id, name, and the line families it's on.
const stations: HomeStation[] = getStations().map((s) => ({ id: s.id, name: s.name, lines: [...new Set(s.lines.map(lineFamily))] }));

export default function Page() {
  return (
    <Screen title="Taste of T" tab="home" hideHeader>
      <HomeScreen stations={stations} />
    </Screen>
  );
}
