// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// /rewards/claim?placeId=...: claim points for a meal at a recommended place.
import { Suspense } from "react";
import { Screen } from "@/components/shared/ios";
import ClaimVisitScreen from "@/components/rewards/ClaimVisitScreen";

async function Claim({ searchParams }: { searchParams: PageProps<"/rewards/claim">["searchParams"] }) {
  const placeId = (await searchParams).placeId;
  return <ClaimVisitScreen initialPlaceId={typeof placeId === "string" ? placeId : null} />;
}

export default function Page({ searchParams }: PageProps<"/rewards/claim">) {
  return (
    <Screen title="Claim Points" tab="profile" back={{ href: "/profile", label: "Profile" }}>
      <Suspense fallback={<p className="mt-6 text-center text-[15px] text-label-2">Loading…</p>}>
        <Claim searchParams={searchParams} />
      </Suspense>
    </Screen>
  );
}
