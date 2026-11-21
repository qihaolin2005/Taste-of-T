// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// One screen: large DM Serif title that collapses into a small centered title in a blurred
// lavender bar as you scroll, safe-area padding, and the floating tab bar. Every page renders
// inside this.
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import InstallPrompt from "../InstallPrompt";
import TabBar, { NAV_SPACE, type TabId } from "./TabBar";
import { ChevronLeft } from "./icons";

type Props = {
  title: string;
  /** Which tab-bar item is highlighted. */
  tab?: TabId;
  children: ReactNode;
  /** Shows "< label" in the nav bar, like a NavigationStack back button. */
  back?: { href: string; label: string };
  /** Right side of the nav bar (e.g. a Share button). */
  trailing?: ReactNode;
  /** Hide the tab bar for focused flows. */
  hideTabBar?: boolean;
  /**
   * Skip the nav bar and large title, for screens that draw their own header (Home).
   * `title` is still required for consistency but isn't rendered.
   */
  hideHeader?: boolean;
};

export default function Screen({ title, tab, children, back, trailing, hideTabBar, hideHeader }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Show the small inline title once the large title scrolls under the nav bar.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
      rootMargin: "-44px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="min-h-dvh bg-grouped">
      {!hideHeader && (
        <header
          className={`sticky top-0 z-30 transition-colors duration-200 ${
            collapsed ? "border-b-[0.5px] border-separator bg-bar backdrop-blur-xl backdrop-saturate-150" : "border-b-[0.5px] border-transparent"
          }`}
          style={{ paddingTop: "var(--safe-top)" }}
        >
          <div className="relative mx-auto flex h-11 max-w-lg items-center px-2">
            <div className="flex min-w-0 flex-1 items-center">
              {back && (
                <Link href={back.href} className="flex items-center text-[17px] text-tint active:opacity-50">
                  <ChevronLeft />
                  <span className="truncate">{back.label}</span>
                </Link>
              )}
            </div>
            <p
              className={`pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-semibold transition-opacity duration-200 ${
                collapsed ? "opacity-100" : "opacity-0"
              }`}
            >
              {title}
            </p>
            <div className="flex flex-1 items-center justify-end gap-3 pr-2 text-tint">{trailing}</div>
          </div>
        </header>
      )}

      <main
        className="mx-auto max-w-lg px-5"
        style={{
          paddingBottom: hideTabBar ? "calc(var(--safe-bottom) + 24px)" : NAV_SPACE,
          ...(hideHeader ? { paddingTop: "calc(var(--safe-top) + 14px)" } : {}),
        }}
      >
        {!hideHeader && (
          <h1 ref={titleRef} className="pb-3 pt-1 font-serif text-[34px] font-normal leading-[1.08] tracking-[-0.025em] text-label">
            {title}
          </h1>
        )}
        {children}
      </main>

      {!hideTabBar && <TabBar active={tab} />}
      <InstallPrompt />
    </div>
  );
}
