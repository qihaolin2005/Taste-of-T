// Owner: P4 - Game Layer & Map (see TEAM.md)
// Points, rewards and achievements, trips, ratings, wishlist, account.
import { ListRow, ListSection, MapIcon, Screen, StarIcon, TrophyIcon } from "@/components/shared/ios";
import AccountSection from "@/components/auth/AccountSection";
import { PointsHistory, ProfileHeader } from "@/components/game/PointsCard";
import FoodRows from "@/components/game/FoodRows";
import { ACHIEVEMENTS } from "@/features/gamification/achievements";
import { REWARDS } from "@/features/gamification/shop";

export default function Page() {
  const achievementPoints = ACHIEVEMENTS.reduce((n, a) => n + a.points, 0);
  return (
    <Screen title="Profile" tab="profile">
      <ProfileHeader />

      <ListSection header="Rewards">
        <ListRow icon={<StarIcon size={17} />} title="Redeem points" subtitle={`${REWARDS.length} rewards, from a free coffee to $10 off for your group`} href="/rewards" />
        <ListRow
          icon={<TrophyIcon size={18} />}
          title="Achievements"
          subtitle={`${ACHIEVEMENTS.length} to unlock, worth ${achievementPoints.toLocaleString("en-US")} points`}
          href="/rewards"
        />
      </ListSection>

      <PointsHistory />

      <ListSection header="Trips">
        <ListRow icon={<MapIcon size={16} />} iconBg="#ff375f" title="My trips" subtitle="Your paths to dinner, like Strava" href="/trips" />
      </ListSection>

      <FoodRows />

      <AccountSection />
    </Screen>
  );
}
