// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Spin the T: a quest picked by the ML recommender near where you are (calls /api/spin).
import { Screen } from "@/components/shared/ios";
import SpinScreen from "@/components/solo/SpinScreen";

export default function Page() {
  return (
    <Screen title="Spin the T" tab="spin">
      <SpinScreen />
    </Screen>
  );
}
