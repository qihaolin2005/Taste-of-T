// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// First-run setup. src/proxy.ts sends new accounts here until they finish.
import type { Metadata } from "next";
import { Screen } from "@/components/shared/ios";
import OnboardingForm from "@/components/auth/OnboardingForm";

export const metadata: Metadata = { title: "Welcome · Taste of T" };

export default function Page() {
  return (
    <Screen title="Any Dietary Needs?" hideTabBar>
      <OnboardingForm />
    </Screen>
  );
}
