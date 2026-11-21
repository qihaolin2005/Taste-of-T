// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// /room/BHSG/plan: the group adventure (Figma layout). Shows the real room data; the route
// itself waits for P1's group planner. See components/group/GroupPlanScreen.
import { Suspense } from "react";
import GroupPlanScreen from "@/components/group/GroupPlanScreen";
import { Screen } from "@/components/shared/ios";

async function Plan({ params }: { params: PageProps<"/room/[roomId]/plan">["params"] }) {
  const { roomId } = await params;
  return <GroupPlanScreen code={roomId.toUpperCase()} />;
}

export default function Page({ params }: PageProps<"/room/[roomId]/plan">) {
  // The code is only known at request time, so it streams in under Suspense.
  return (
    <Screen title="Group Adventure" tab="night" hideHeader>
      <Suspense fallback={<div className="h-[320px] animate-pulse rounded-[20px] bg-cell-2" aria-label="Loading plan" />}>
        <Plan params={params} />
      </Suspense>
    </Screen>
  );
}
