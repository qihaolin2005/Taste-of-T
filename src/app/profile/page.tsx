// Owner: P4 - Game Layer & Map (see TEAM.md)
// Points, achievements, ratings, wishlist, account.
// TODO(P4): real achievements, ratings, and wishlist counts.
import { HeartIcon, ListRow, ListSection, MoonIcon, Screen, StarIcon, TrainIcon } from "@/components/shared/ios";
import AccountSection from "@/components/auth/AccountSection";
import { PointsHistory, ProfileHeader } from "@/components/game/PointsCard";

export default function Page() {
  return (
    <Screen title="Profile" tab="profile">
      <ProfileHeader />

      <PointsHistory />

      <ListSection header="Achievements">
        <ListRow icon={<TrainIcon size={17} />} iconBg="#8e8e93" title="Made the last train" subtitle="Locked" />
        <ListRow icon={<MoonIcon size={16} />} iconBg="#8e8e93" title="Night owl" subtitle="Eat past midnight" />
        <ListRow icon={<StarIcon size={17} />} iconBg="#8e8e93" title="New line unlocked" subtitle="Check in on a new line" />
      </ListSection>

      <ListSection header="Food">
        <ListRow icon={<StarIcon size={17} />} iconBg="#ff9500" title="My ratings" value="0" href="/profile" />
        <ListRow icon={<HeartIcon size={16} />} iconBg="#ff2d55" title="Wishlist" value="0" href="/profile" />
      </ListSection>

      <AccountSection />
    </Screen>
  );
}
