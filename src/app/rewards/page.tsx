// Owner: P4 - Game Layer & Map (see TEAM.md)
// /rewards: spend points on rewards (free coffee, $5 off...), your vouchers, and achievements.
import { Screen } from "@/components/shared/ios";
import RewardsScreen from "@/components/rewards/RewardsScreen";

export default function Page() {
  return (
    <Screen title="Rewards" tab="home" back={{ href: "/", label: "Home" }}>
      <RewardsScreen />
    </Screen>
  );
}
