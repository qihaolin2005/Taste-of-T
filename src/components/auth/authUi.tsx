// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Small building blocks shared by the Figma-styled entry screens (login + onboarding):
// line icons, a spinner, the icon text field, pill buttons, chips, and the step header.
// These screens are light-only to match the Figma file, so they use the Figma hex values.
"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

export const serif = "[font-family:var(--font-dm-serif),Georgia,serif]";

const iconPaths = {
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M2 12s4-7 10-7c2 0 3.8.7 5.3 1.7M22 12s-4 7-10 7c-2 0-3.8-.7-5.3-1.7" />
      <path d="m3 3 18 18" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  train: (
    <>
      <rect x="5" y="2" width="14" height="16" rx="4" />
      <path d="M8 22l2-4M16 18l2 4M8 11h8M9 6h.01M15 6h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  share: (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
    </>
  ),
  users: <path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 20v-2a4 4 0 0 0-3-3.87M16 2.1a4 4 0 0 1 0 7.8" />,
};

export type IconName = keyof typeof iconPaths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {iconPaths[name]}
    </svg>
  );
}

export function Spinner() {
  return <span aria-hidden className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" />;
}

/** Figma "auth-field": white rounded input with a purple leading icon and optional trailing action. */
export function AuthField({
  icon,
  label,
  error,
  action,
  id,
  ...input
}: { icon: IconName; label: string; error?: string; action?: ReactNode; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label
        htmlFor={id}
        className={`grid min-h-[56px] grid-cols-[24px_1fr_auto] items-center gap-2.5 rounded-[18px] border bg-white pl-4 pr-1 transition focus-within:ring-4 ${
          error
            ? "border-[#A86D93] focus-within:ring-[#A86D93]/15"
            : "border-[#E2DBE9] focus-within:border-[#7954AC] focus-within:ring-[#7954AC]/15"
        }`}
      >
        <span className="text-[#7954AC]">
          <Icon name={icon} />
        </span>
        <input
          id={id}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...input}
          className="h-[54px] w-full min-w-0 bg-transparent text-[16px] text-[#30203F] outline-none placeholder:text-[#9A93A3] disabled:opacity-60"
        />
        {action ?? <span className="w-3" />}
      </label>
      {error && (
        <p id={errorId} className="mt-1.5 pl-4 text-[13px] text-[#8C456C]">
          {error}
        </p>
      )}
    </div>
  );
}

/** Figma "auth-primary": the purple pill. */
export const primaryButton =
  "flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[#7954AC] text-[16px] font-bold text-white shadow-[0_9px_20px_rgba(121,84,172,0.15)] transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100";
/** Figma "auth-secondary": the light lavender pill. */
export const secondaryButton =
  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#EEE7FC] text-[16px] font-bold text-[#30203F] transition active:scale-[0.98] active:bg-[#E3D8F8] disabled:opacity-60 disabled:active:scale-100";
/** Figma footer text button ("Skip", "Back"). */
export const textButton = "min-h-11 w-full text-[14px] font-medium text-[#777080] active:opacity-60 disabled:opacity-40";

/** Figma "auth-chips": toggle chips, with a check when selected. */
export function ChipGroup({ options, selected, onToggle, label }: { options: { value: string; label: string }[]; selected: ReadonlySet<string>; onToggle: (v: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={`flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-[14px] transition-colors ${
              on ? "border-[#B7A2E4] bg-[#EEE7FC] font-bold text-[#30203F]" : "border-[#DED7E7] bg-white text-[#777080]"
            }`}
          >
            {on && <Icon name="check" size={14} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Figma "step-header" + "step-progress": back arrow, "Step N of 4", and four progress bars. */
export function StepHeader({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return (
    <>
      <header className="grid h-12 grid-cols-[44px_1fr_44px] items-center">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="grid h-11 w-11 place-items-center rounded-full border border-[#E5DEED] bg-white text-[#30203F] transition active:scale-95"
          >
            <Icon name="back" />
          </button>
        ) : (
          <span />
        )}
        <span className="text-center text-[13px] font-bold text-[#777080]">
          Step {step} of {total}
        </span>
        <span />
      </header>
      <div className="mb-1 mt-3 grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }} aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={`h-1 rounded-full transition-colors ${i < step ? "bg-[#7954AC]" : "bg-[#E4DEEA]"}`} />
        ))}
      </div>
    </>
  );
}

/** Figma "auth-title": big serif heading + muted subtitle. */
export function AuthTitle({ children, subtitle, className = "" }: { children: ReactNode; subtitle: string; className?: string }) {
  return (
    <div className={className}>
      <h1 className={`${serif} text-[36px] font-normal leading-[1.04] tracking-[-0.025em] text-[#30203F]`}>{children}</h1>
      <p className="mt-2.5 max-w-[315px] text-[16px] leading-[1.5] text-[#777080]">{subtitle}</p>
    </div>
  );
}
