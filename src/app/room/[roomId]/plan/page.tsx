// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// /room/BHSG/plan: the squad's top 5 from the swipe session.
// TODO(P3): add the timed night (NightTimeline + LeaveByList) once the planner lands.
import { Suspense } from "react";
import { Screen } from "@/components/shared/ios";
import SquadPlanView from "@/components/group/SquadPlanView";

async function Plan({ params }: { params: PageProps<"/room/[roomId]/plan">["params"] }) {
  const { roomId } = await params;
  const code = roomId.toUpperCase();
  return (
    <Screen title="Tonight's Plan" tab="night" back={{ href: `/room/${code}`, label: "Group" }}>
      <SquadPlanView code={code} />
    </Screen>
  );
}

export default function Page({ params }: PageProps<"/room/[roomId]/plan">) {
  return (
    <Suspense
      fallback={
        <Screen title="Tonight's Plan" tab="night">
          <p className="mt-6 text-center text-[15px] text-label-2">Loading…</p>
        </Screen>
      }
    >
      <Plan params={params} />
    </Suspense>
  );
}
