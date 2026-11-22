// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Floating bottom navigation from the Taste of T design: a dark pill that floats above the
// home indicator, with the active tab in a purple circle.
// The active tab is passed in by the page (via <Screen tab=...>) rather than read from
// usePathname(), so dynamic routes can still prerender with Cache Components.
// Screen.tsx reserves NAV_SPACE at the bottom of the page so content never hides under it.

import Link from "next/link";
import { DiceIcon, GroupIcon, HomeIcon, MapIcon, PersonIcon } from "./icons";

export type TabId = "home" | "spin" | "night" | "map" | "profile";

/** Page bottom padding needed to clear the floating nav (gap + bar + breathing room). */
export const NAV_SPACE = "calc(max(12px, var(--safe-bottom)) + 70px + 24px)";

const TABS: { id: TabId; href: string; label: string; Icon: typeof HomeIcon }[] = [
  { id: "home", href: "/", label: "Home", Icon: HomeIcon },
  { id: "spin", href: "/spin", label: "Spin", Icon: DiceIcon },
  { id: "night", href: "/room/new", label: "Adventure", Icon: GroupIcon },
  { id: "map", href: "/map", label: "T Map", Icon: MapIcon },
  { id: "profile", href: "/profile", label: "Profile", Icon: PersonIcon },
];

export default function TabBar({ active }: { active?: TabId }) {
  return (
    <nav
      aria-label="Main"
      className="fixed left-1/2 z-40 h-[70px] w-[min(353px,calc(100vw-40px))] -translate-x-1/2 rounded-[25px] bg-nav px-[9px] py-[7px] shadow-[0_14px_30px_rgb(23_23_27/0.26)]"
      style={{ bottom: "max(12px, var(--safe-bottom))" }}
    >
      <ul className="grid h-full grid-cols-5">
        {TABS.map(({ id, href, label, Icon }) => {
          const isActive = id === active;
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 transition-colors ${isActive ? "text-white" : "text-[var(--nav-fg)] active:text-white"}`}
              >
                <span className={`grid h-9 w-[37px] place-items-center rounded-full transition-colors ${isActive ? "bg-[#7954ac]" : ""}`}>
                  <Icon size={21} />
                </span>
                <span className="text-[10px] font-semibold leading-3 tracking-normal">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
