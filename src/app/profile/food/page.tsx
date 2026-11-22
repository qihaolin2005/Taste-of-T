// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// /profile/food: change dietary needs, favorite cuisines and foods to skip after onboarding.
import { Screen } from "@/components/shared/ios";
import FoodPreferences from "@/components/profile/FoodPreferences";

export default function Page() {
  return (
    <Screen title="Food & Diet" tab="profile" back={{ href: "/profile", label: "Profile" }}>
      <FoodPreferences />
    </Screen>
  );
}
