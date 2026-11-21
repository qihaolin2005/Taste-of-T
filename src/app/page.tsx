// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Landing: Spin the T / Start a night.
import Link from "next/link";
import type { ReactNode } from "react";
import { DiceIcon, GroupIcon, ListRow, ListSection, MapIcon, MoonIcon, Screen, StarIcon, TrainIcon } from "@/components/shared/ios";
import { PointsValue } from "@/components/game/PointsCard";

function HeroCard({ href, title, subtitle, gradient, icon }: { href: string; title: string; subtitle: string; gradient: string; icon: ReactNode }) {
  return (
    <Link href={href} className="relative block overflow-hidden rounded-[20px] p-5 text-white shadow-sm active:scale-[0.98] transition-transform" style={{ background: gradient }}>
      <span className="flex size-11 items-center justify-center rounded-full bg-white/20 backdrop-blur">{icon}</span>
      <p className="mt-6 text-[22px] font-bold leading-7">{title}</p>
      <p className="mt-1 text-[15px] leading-5 text-white/85">{subtitle}</p>
    </Link>
  );
}

export default function Page() {
  return (
    <Screen title="Taste of T" tab="home">
      <p className="-mt-1 mb-4 text-[15px] text-label-2">Eat your way across the T tonight.</p>

      <div className="grid gap-3">
        <HeroCard
          href="/spin"
          title="Spin the T"
          subtitle="Solo food quest near a station. Budget in, adventure out."
          gradient="linear-gradient(135deg, #ff9500 0%, #ff5e3a 100%)"
          icon={<DiceIcon size={24} />}
        />
        <HeroCard
          href="/room/new"
          title="Start a Night"
          subtitle="Plan dinner, dessert, and fun for the group, and everyone makes the last train."
          gradient="linear-gradient(135deg, #5856d6 0%, #2f80ed 100%)"
          icon={<GroupIcon size={24} />}
        />
      </div>

      {/* TODO(P4): real stats from gamification once identity + check-ins exist. */}
      <ListSection header="Your Progress">
        <ListRow icon={<StarIcon size={17} />} iconBg="#ffcc00" title="Points" value={<PointsValue />} href="/profile" />
        <ListRow icon={<TrainIcon size={17} />} iconBg="var(--line-red)" title="Stations stamped" value="0" href="/map" />
        <ListRow icon={<MapIcon size={17} />} iconBg="var(--line-green)" title="Lines unlocked" value="0 of 4" href="/map" />
      </ListSection>

      <ListSection header="Tonight" footer="Boston closes early. Plans only include places open when you arrive.">
        <ListRow icon={<MoonIcon size={16} />} iconBg="#5856d6" title="Last trains" subtitle="Around 12:30 AM on most lines" />
      </ListSection>
    </Screen>
  );
}
