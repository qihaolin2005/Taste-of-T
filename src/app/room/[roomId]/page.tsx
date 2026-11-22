// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// /room/BHSG: a group. Shows the code, the join form, and who's coming (live).
import { Suspense } from "react";
import { Screen } from "@/components/shared/ios";
import RoomScreen from "@/components/group/RoomScreen";
import { getStations } from "@/lib/mbta/stations";

// Station names for the pickers (sorted by name in the snapshot).
const stations = getStations().map((s) => ({ id: s.id, name: s.name }));

async function Room({ params }: { params: PageProps<"/room/[roomId]">["params"] }) {
  const { roomId } = await params;
  return <RoomScreen key={roomId.toUpperCase()} code={roomId.toUpperCase()} stations={stations} />;
}

export default function Page({ params }: PageProps<"/room/[roomId]">) {
  // The code is only known at request time, so it streams in under Suspense.
  return (
    <Suspense
      fallback={
        <Screen title="Group" tab="night">
          <p className="mt-6 text-center text-[15px] text-label-2">Loading group…</p>
        </Screen>
      }
    >
      <Room params={params} />
    </Suspense>
  );
}
