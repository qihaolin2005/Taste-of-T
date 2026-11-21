// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Solo Spin form + QuestCard result (calls /api/spin).
// TODO(P3): make rows editable (sheets/pickers) and wire the button to /api/spin.
import { Button, ClockIcon, DiceIcon, DollarIcon, ForkKnifeIcon, ListRow, ListSection, Screen, TrainIcon } from "@/components/shared/ios";

export default function Page() {
  return (
    <Screen title="Spin the T" tab="spin">
      <ListSection header="Quest Settings">
        <ListRow icon={<DollarIcon size={17} />} iconBg="#34c759" title="Budget" value="$25" />
        <ListRow icon={<ClockIcon size={17} />} iconBg="#007aff" title="Time" value="2 hours" />
        <ListRow icon={<TrainIcon size={17} />} iconBg="var(--line-orange)" title="Start station" value="Downtown Crossing" />
        <ListRow icon={<ForkKnifeIcon size={17} />} iconBg="#ff2d55" title="Craving" value="Anything" />
      </ListSection>

      <div className="mt-6">
        <Button>
          <DiceIcon size={20} /> Spin
        </Button>
      </div>
      <p className="mt-3 px-4 text-center text-[13px] text-label-2">We&apos;ll pick a station and a mission. Check in there to earn its stamp.</p>
    </Screen>
  );
}
