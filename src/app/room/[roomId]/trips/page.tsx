// Owner: P4 - Game Layer & Map (see TEAM.md)
// /room/BHSG/trips: everyone in the group's path to the restaurant on one map.
import { Suspense } from "react";
import { Screen } from "@/components/shared/ios";
import GroupTripsScreen from "@/components/trips/GroupTripsScreen";

async function Trips({ params }: { params: PageProps<"/room/[roomId]/trips">["params"] }) {
  const { roomId } = await params;
  return <GroupTripsScreen key={roomId.toUpperCase()} code={roomId.toUpperCase()} />;
}

export default function Page({ params }: PageProps<"/room/[roomId]/trips">) {
  return (
    <Suspense
      fallback={
        <Screen title="Trip Map" tab="night">
          <p className="mt-6 text-center text-[15px] text-label-2">Loading trips…</p>
        </Screen>
      }
    >
      <Trips params={params} />
    </Suspense>
  );
}
