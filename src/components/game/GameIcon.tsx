// Owner: P4 - Game Layer & Map (see TEAM.md)
// Rewards and achievements name their icon ("coffee", "bus"...) so the lists stay plain data;
// this draws it from the app's own line-icon set (src/components/shared/ios/icons.tsx).
import {
  BikeIcon,
  BusIcon,
  CakeIcon,
  ClockIcon,
  CoffeeIcon,
  CompassIcon,
  ForkKnifeIcon,
  GroupIcon,
  MapIcon,
  MoonIcon,
  RouteIcon,
  SwapIcon,
  TagIcon,
  TrainIcon,
} from "@/components/shared/ios";
import type { GameIconName } from "@/features/gamification/achievements";

const ICONS: Record<GameIconName, (p: { size?: number; className?: string }) => React.ReactNode> = {
  coffee: CoffeeIcon,
  cake: CakeIcon,
  tag: TagIcon,
  bike: BikeIcon,
  group: GroupIcon,
  bus: BusIcon,
  train: TrainIcon,
  swap: SwapIcon,
  route: RouteIcon,
  map: MapIcon,
  compass: CompassIcon,
  forkKnife: ForkKnifeIcon,
  moon: MoonIcon,
  clock: ClockIcon,
};

export default function GameIcon({ name, size = 20, className }: { name: GameIconName; size?: number; className?: string }) {
  const Icon = ICONS[name];
  return <Icon size={size} className={className} />;
}
