// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Join form (MemberForm) + member list, polls room.
// TODO(P3): read roomId, render MemberForm, poll members via useRoomPolling.
import { Button, DollarIcon, ListRow, ListSection, Screen, ShareIcon, TrainIcon } from "@/components/shared/ios";

export default function Page() {
  return (
    <Screen title="Join the Night" tab="night" back={{ href: "/", label: "Home" }} trailing={<ShareIcon size={22} />}>
      <ListSection header="You">
        <ListRow icon={<TrainIcon size={17} />} iconBg="var(--line-red)" title="Starting from" value="Choose" />
        <ListRow icon={<TrainIcon size={17} />} iconBg="var(--line-blue)" title="Going home to" value="Choose" />
        <ListRow icon={<DollarIcon size={17} />} iconBg="#34c759" title="Budget" value="$40" />
      </ListSection>

      <ListSection header="Optional" footer="We'll make sure your plan gets you to your last train.">
        <ListRow title="Leaving early" value="No" />
        <ListRow title="Max walk from station" value="Any" />
      </ListSection>

      <ListSection header="In This Room">
        <ListRow title="Waiting for friends…" subtitle="Share the link to invite people" />
      </ListSection>

      <div className="mt-6">
        <Button>Join</Button>
      </div>
    </Screen>
  );
}
