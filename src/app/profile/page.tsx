// Owner: P4 - Game Layer & Map (see TEAM.md)
// Points, achievements, ratings, wishlist, account.
// TODO(P4): real achievements.
import { ListRow, ListSection, MapIcon, MoonIcon, Screen, StarIcon, TrainIcon } from "@/components/shared/ios";
import AccountSection from "@/components/auth/AccountSection";
import { PointsHistory, ProfileHeader } from "@/components/game/PointsCard";
import FoodRows from "@/components/game/FoodRows";

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

      <ListSection header="Trips">
        <ListRow icon={<MapIcon size={16} />} iconBg="#ff375f" title="My trips" subtitle="Your paths to dinner, like Strava" href="/trips" />
      </ListSection>

      <FoodRows />

      <AccountSection />
    </Screen>
  );
}
