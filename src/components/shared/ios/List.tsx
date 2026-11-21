// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Grouped list in the Taste of T style: a section title + a rounded white card of rows,
// each with an optional lavender icon tile, subtitle, trailing value, and chevron.

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "./icons";

export function ListSection({ header, footer, children }: { header?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-7 first:mt-3">
      {header && <h2 className="px-1 pb-2.5 text-[18px] font-bold leading-6 tracking-[-0.02em] text-label">{header}</h2>}
      <div className="overflow-hidden rounded-[20px] border border-separator bg-cell shadow-[var(--card-shadow)]">{children}</div>
      {footer && <p className="px-2 pt-2 text-[13px] leading-[18px] text-label-2">{footer}</p>}
    </section>
  );
}

type RowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Trailing secondary text, e.g. a current value. */
  value?: ReactNode;
  /** Icon shown in a rounded lavender tile. */
  icon?: ReactNode;
  /**
   * Kept for compatibility with existing callers. The design system draws every icon tile
   * in lavender + plum, so this no longer colors the tile.
   */
  iconBg?: string;
  href?: string;
  onClick?: () => void;
  /** Custom trailing element (switch, badge). Replaces the chevron. */
  accessory?: ReactNode;
  destructive?: boolean;
};

export function ListRow({ title, subtitle, value, icon, href, onClick, accessory, destructive }: RowProps) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      {icon && (
        <span className="ml-4 flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-lavender text-plum">
          {icon}
        </span>
      )}
      <span className={`ios-row-body flex min-h-[60px] min-w-0 flex-1 items-center gap-2 py-3 pr-4 ${icon ? "ml-3" : "ml-4"}`}>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[16px] font-semibold leading-[22px] ${destructive ? "text-danger" : ""}`}>{title}</span>
          {subtitle && <span className="block truncate text-[14px] leading-5 text-label-2">{subtitle}</span>}
        </span>
        {value && <span className="shrink-0 text-[15px] font-medium text-label-2">{value}</span>}
        {accessory ?? (interactive && <ChevronRight className="shrink-0 text-label-3" />)}
      </span>
    </>
  );

  const cls = `ios-row flex w-full items-center text-left transition-colors ${interactive ? "active:bg-cell-2" : ""}`;
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}
