// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Create a room, get share link.
// TODO(P3): editable fields + POST /api/rooms, then route to /room/[roomId].
import { Button, ClockIcon, ForkKnifeIcon, GroupIcon, ListRow, ListSection, Screen } from "@/components/shared/ios";

export default function Page() {
  return (
    <Screen title="Start a Night" tab="night">
      <ListSection header="The Night">
        <ListRow icon={<GroupIcon size={17} />} iconBg="#5856d6" title="Name" value="Friday crew" />
        <ListRow icon={<ClockIcon size={17} />} iconBg="#007aff" title="Starts" value="Tonight, 7:00 PM" />
      </ListSection>

      <ListSection header="Stops" footer="Everyone gets at least one stop that matches their taste, and no one always gets the long ride.">
        <ListRow icon={<ForkKnifeIcon size={17} />} iconBg="#ff9500" title="Dinner" />
        <ListRow icon={<ForkKnifeIcon size={17} />} iconBg="#ff2d55" title="Dessert or boba" />
        <ListRow icon={<ForkKnifeIcon size={17} />} iconBg="#34c759" title="Activity" />
      </ListSection>

      <div className="mt-6">
        <Button>Create Room &amp; Get Link</Button>
      </div>
    </Screen>
  );
}
