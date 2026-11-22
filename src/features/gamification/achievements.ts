// Owner: P4 - Game Layer & Map (see TEAM.md)
// Achievements: one-time goals that each earn points. This is the list (what they are and what
// they're worth), shown on the Rewards page and Profile.
// TODO(P4): award them. Nothing checks them yet, so everyone sees them locked. The plan: after a
// trip ends, a ride is verified (src/features/rides) or a meal is claimed (src/features/rewards),
// look at what the user has done and pay each new one once (a points history entry, like quests).

export type AchievementCategory = "transit" | "adventure" | "night";

/** Icons from the app's own line-icon set; src/components/game/GameIcon.tsx draws them. */
export type GameIconName = "coffee" | "cake" | "tag" | "bike" | "group" | "bus" | "train" | "swap" | "route" | "map" | "compass" | "forkKnife" | "moon" | "clock";

export type Achievement = {
  key: string;
  title: string;
  /** What you have to do, as shown under the title. */
  description: string;
  points: number;
  icon: GameIconName;
  category: AchievementCategory;
};

export const ACHIEVEMENTS: readonly Achievement[] = [
  // Getting around
  { key: "take-bus", title: "Bus Rider", description: "Take an MBTA bus on the way to a meal.", points: 50, icon: "bus", category: "transit" },
  { key: "take-t", title: "Ride the T", description: "Take the subway or Green Line on the way to a meal.", points: 50, icon: "train", category: "transit" },
  { key: "t-and-bus", title: "Mix It Up", description: "Take the T and a bus on the same trip.", points: 100, icon: "swap", category: "transit" },
  { key: "change-lines", title: "Line Hopper", description: "Change between two T lines on one trip, like Red to Orange.", points: 75, icon: "route", category: "transit" },
  { key: "new-line", title: "New Line Unlocked", description: "Ride a T line you haven't ridden before.", points: 50, icon: "map", category: "transit" },
  // Adventures with your group
  { key: "first-adventure", title: "First Adventure", description: "Go on an adventure with your group.", points: 100, icon: "compass", category: "adventure" },
  { key: "two-stop-adventure", title: "Progressive Dinner", description: "Visit at least 2 restaurants on one adventure.", points: 150, icon: "forkKnife", category: "adventure" },
  // Late nights
  { key: "night-owl", title: "Night Owl", description: "Eat somewhere past midnight.", points: 75, icon: "moon", category: "night" },
  { key: "last-train", title: "Made the Last Train", description: "Catch the last train home after an adventure.", points: 100, icon: "clock", category: "night" },
];

export const ACHIEVEMENT_CATEGORIES: { key: AchievementCategory; title: string }[] = [
  { key: "transit", title: "Getting Around" },
  { key: "adventure", title: "Adventures" },
  { key: "night", title: "Late Nights" },
];

export function achievementByKey(key: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key);
}
