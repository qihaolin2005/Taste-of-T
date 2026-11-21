// Owner: P4 - Game Layer & Map (see TEAM.md)
// T map: real MBTA lines and stations (offline snapshot), live trains, and your stamps.
import { Screen } from "@/components/shared/ios";
import TMap from "@/components/game/TMap";
import { getLines, getStations } from "@/lib/mbta/stations";

export default function Page() {
  return (
    <Screen title="T Map" tab="map">
      <TMap stations={getStations()} lines={getLines()} />
    </Screen>
  );
}
