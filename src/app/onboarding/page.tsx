// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// First-run setup. src/proxy.ts sends new accounts here until they finish.
// Full-screen Figma onboarding (4 steps + "you're all set"), light-only like the login flow,
// so it renders without <Screen>.
import type { Metadata } from "next";
import OnboardingForm from "@/components/auth/OnboardingForm";
import { getStations } from "@/lib/mbta/stations";

export const metadata: Metadata = { title: "Welcome · Taste of T" };

// Station search options for step 3, sorted by name (static data, so this prerenders).
// Plain code-point sort, not localeCompare: locale-dependent work breaks Next's prerender check.
const stations = getStations()
  .map((s) => ({ id: s.id, name: s.name }))
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

export default function Page() {
  return (
    <div className="min-h-dvh bg-[#F8F5FF] text-[#30203F] [color-scheme:light] [font-family:var(--font-sans)]">
      <OnboardingForm stations={stations} />
    </div>
  );
}
