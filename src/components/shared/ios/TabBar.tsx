// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// iOS bottom tab bar: translucent blur, tint on the active tab, sits above the home indicator.
// The active tab is passed in by the page (via <Screen tab=...>) rather than read from
// usePathname(), so dynamic routes can still prerender with Cache Components.

import Link from "next/link";
import { DiceIcon, GroupIcon, HomeIcon, MapIcon, PersonIcon } from "./icons";

export type TabId = "home" | "spin" | "night" | "map" | "profile";

const TABS: { id: TabId; href: string; label: string; Icon: typeof HomeIcon }[] = [
  { id: "home", href: "/", label: "Home", Icon: HomeIcon },
  { id: "spin", href: "/spin", label: "Spin", Icon: DiceIcon },
  { id: "night", href: "/room/new", label: "Night", Icon: GroupIcon },
  { id: "map", href: "/map", label: "T Map", Icon: MapIcon },
  { id: "profile", href: "/profile", label: "Profile", Icon: PersonIcon },
];

export default function TabBar({ active }: { active?: TabId }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t-[0.5px] border-separator bg-bar backdrop-blur-xl backdrop-saturate-150"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="mx-auto flex h-[49px] max-w-lg">
        {TABS.map(({ id, href, label, Icon }) => {
          const isActive = id === active;
          return (
            <li key={id} className="flex-1">
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 pt-1 ${isActive ? "text-tint" : "text-label-2"}`}
              >
                <Icon size={25} />
                <span className="text-[10px] font-medium tracking-normal">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
