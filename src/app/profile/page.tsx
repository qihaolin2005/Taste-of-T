// Owner: P4 - Game Layer & Map (see TEAM.md)
// XP, stamps, achievements, ratings, wishlist.
// TODO(P4): real user data from identity + gamification + ratings.
import { HeartIcon, ListRow, ListSection, MoonIcon, PersonIcon, Screen, StarIcon, TrainIcon } from "@/components/shared/ios";

export default function Page() {
  return (
    <Screen title="Profile" tab="profile">
      <div className="mt-3 flex items-center gap-4 rounded-[10px] bg-cell p-4">
        <span className="flex size-16 items-center justify-center rounded-full bg-tint/15 text-tint">
          <PersonIcon size={40} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[20px] font-semibold">T Explorer</p>
          <p className="text-[15px] text-label-2">Level 1 · 0 / 500 XP</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cell-2">
            <div className="h-full w-[4%] rounded-full bg-tint" />
          </div>
        </div>
      </div>

      <ListSection header="Achievements">
        <ListRow icon={<TrainIcon size={17} />} iconBg="#8e8e93" title="Made the last train" subtitle="Locked" />
        <ListRow icon={<MoonIcon size={16} />} iconBg="#8e8e93" title="Night owl" subtitle="Eat past midnight" />
        <ListRow icon={<StarIcon size={17} />} iconBg="#8e8e93" title="New line unlocked" subtitle="Check in on a new line" />
      </ListSection>

      <ListSection header="Food">
        <ListRow icon={<StarIcon size={17} />} iconBg="#ff9500" title="My ratings" value="0" href="/profile" />
        <ListRow icon={<HeartIcon size={16} />} iconBg="#ff2d55" title="Wishlist" value="0" href="/profile" />
      </ListSection>
    </Screen>
  );
}
