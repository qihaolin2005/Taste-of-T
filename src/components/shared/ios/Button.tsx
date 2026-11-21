// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// iOS button styles: .borderedProminent (filled), .bordered (tinted), .borderless (plain).

import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "filled" | "tinted" | "plain";

const base = "inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] px-5 text-[17px] font-semibold transition-opacity active:opacity-60 disabled:opacity-40";
const variants: Record<Variant, string> = {
  filled: "bg-tint text-tint-fg",
  tinted: "bg-tint/15 text-tint",
  plain: "text-tint",
};

type Props = { children: ReactNode; variant?: Variant; href?: string; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" };

export default function Button({ children, variant = "filled", href, onClick, disabled, type = "button" }: Props) {
  const cls = `${base} ${variants[variant]}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}
