// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Pill buttons from the Taste of T design system:
//   filled = purple primary, tinted = light lavender secondary, plain = text link.

import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "filled" | "tinted" | "plain";

const base =
  "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full px-5 text-[16px] font-bold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100";
const variants: Record<Variant, string> = {
  filled: "bg-tint text-tint-fg shadow-[0_9px_20px_rgb(121_84_172/0.18)]",
  tinted: "bg-lavender text-plum",
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
