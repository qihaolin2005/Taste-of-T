// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Squads (the Night tab): your groups, Create a Squad, Join a Squad. See SquadsHub.
import SquadsHub from "@/components/group/SquadsHub";
import { Screen } from "@/components/shared/ios";

export default function Page() {
  return (
    <Screen title="Squads" tab="night" hideHeader>
      <SquadsHub />
    </Screen>
  );
}
