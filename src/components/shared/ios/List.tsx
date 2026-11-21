// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// SwiftUI `List` with `.insetGrouped` style: Section (header/footer) + rows with
// optional colored icon tile, subtitle, trailing value, and disclosure chevron.

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "./icons";

export function ListSection({ header, footer, children }: { header?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-3">
      {header && <h2 className="px-4 pb-1.5 text-[13px] uppercase tracking-normal text-label-2">{header}</h2>}
      <div className="overflow-hidden rounded-[10px] bg-cell">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-[13px] leading-[18px] text-label-2">{footer}</p>}
    </section>
  );
}

type RowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Trailing secondary text, e.g. a current value. */
  value?: ReactNode;
  /** Colored rounded-square icon tile, like iOS Settings. */
  icon?: ReactNode;
  iconBg?: string;
  href?: string;
  onClick?: () => void;
  /** Custom trailing element (switch, badge). Replaces the chevron. */
  accessory?: ReactNode;
  destructive?: boolean;
};

export function ListRow({ title, subtitle, value, icon, iconBg = "var(--tint)", href, onClick, accessory, destructive }: RowProps) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      {icon && (
        <span className="ml-4 flex size-[29px] shrink-0 items-center justify-center rounded-[7px] text-white" style={{ background: iconBg }}>
          {icon}
        </span>
      )}
      <span className={`ios-row-body flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2.5 pr-4 ${icon ? "ml-3" : "ml-4"}`}>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[17px] leading-[22px] ${destructive ? "text-[#ff3b30]" : ""}`}>{title}</span>
          {subtitle && <span className="block truncate text-[15px] leading-5 text-label-2">{subtitle}</span>}
        </span>
        {value && <span className="shrink-0 text-[17px] text-label-2">{value}</span>}
        {accessory ?? (interactive && <ChevronRight className="shrink-0 text-label-3" />)}
      </span>
    </>
  );

  const cls = `ios-row flex w-full items-center text-left ${interactive ? "active:bg-cell-2" : ""}`;
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}
