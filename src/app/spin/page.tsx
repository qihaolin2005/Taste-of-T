// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Spin the T (Figma "Plan an Adventure" -> "Your Adventure"). The planner builds a route from
// the recommender and turns it into quests; see components/solo/SpinPlanner for the details.
// TODO(P1): when /api/spin + generatePlan() land, SpinPlanner can call them instead.
import SpinPlanner, { type SpinStation } from "@/components/solo/SpinPlanner";
import { Screen } from "@/components/shared/ios";
import { getStations } from "@/lib/mbta/stations";

// Static station data (prerendered) for the starting-station search and route colors.
// Plain code-point sort, not localeCompare: locale-dependent work breaks Next's prerender check.
const stations: SpinStation[] = getStations()
  .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, lines: [...s.lines] }))
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

export default function Page() {
  return (
    <Screen title="Spin the T" tab="spin" hideHeader>
      <SpinPlanner stations={stations} />
    </Screen>
  );
}
