// Owner: P4 - Game Layer & Map (see TEAM.md)
// /trips/:id: one trip on the map.
import { Suspense } from "react";
import { Screen } from "@/components/shared/ios";
import TripDetailScreen from "@/components/trips/TripDetailScreen";

async function Trip({ params }: { params: PageProps<"/trips/[tripId]">["params"] }) {
  const { tripId } = await params;
  return <TripDetailScreen key={tripId} id={tripId} />;
}

export default function Page({ params }: PageProps<"/trips/[tripId]">) {
  return (
    <Suspense
      fallback={
        <Screen title="Trip" tab="profile">
          <p className="mt-6 text-center text-[15px] text-label-2">Loading trip…</p>
        </Screen>
      }
    >
      <Trip params={params} />
    </Suspense>
  );
}
