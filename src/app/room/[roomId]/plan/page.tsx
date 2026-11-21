// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Night timeline + per-member leave-by times.
// TODO(P3): fetch the room's Plan and render NightTimeline + LeaveByList.
import { ListRow, ListSection, MoonIcon, Screen } from "@/components/shared/ios";

export default function Page() {
  return (
    <Screen title="Tonight's Plan" tab="night" back={{ href: "/", label: "Home" }}>
      <div className="mt-3 rounded-[10px] bg-cell px-4 py-10 text-center">
        <p className="text-[17px] font-semibold">No plan yet</p>
        <p className="mt-1 text-[15px] text-label-2">Once everyone joins, generate the night here.</p>
      </div>

      <ListSection header="Leave By">
        <ListRow icon={<MoonIcon size={16} />} iconBg="#5856d6" title="Each member's last train" subtitle="Shows up with the plan" />
      </ListSection>
    </Screen>
  );
}
