// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Small pieces from the Figma Make Squads screens: initials avatars, the avatar stack, the
// page header, setup-form fields, choice chips, and a station search field. Theme tokens only,
// so dark mode keeps working.
"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { StationOption } from "@/components/shared/StationPicker";
import { formatMinutes } from "@/lib/time";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}

/** Figma .avatar: lavender circle with initials and a white ring. */
export function Avatar({ name, size = 38, tone = "lilac", className = "" }: { name: string; size?: number; tone?: "lilac" | "pink" | "purple"; className?: string }) {
  const bg = tone === "purple" ? "bg-tint text-tint-fg" : tone === "pink" ? "bg-[#f2d7e5] text-plum" : "bg-[#d8cbfa] text-plum";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full border-2 border-cell font-extrabold ${bg} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.3)) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** Figma .avatar-stack: overlapping avatars (every other one pink), "+N" when there are more. */
export function AvatarStack({ names, max = 4, size = 34 }: { names: string[]; max?: number; size?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className="flex" aria-label={names.length ? `Members: ${names.join(", ")}` : "No members yet"}>
      {shown.map((n, i) => (
        <span key={`${n}-${i}`} className="-mr-2">
          <Avatar name={n} size={size} tone={i % 2 ? "pink" : "lilac"} />
        </span>
      ))}
      {extra > 0 && (
        <span className="-mr-2 grid place-items-center rounded-full border-2 border-cell bg-cell-2 text-[11px] font-extrabold text-plum" style={{ width: size, height: size }}>
          +{extra}
        </span>
      )}
    </div>
  );
}

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

const roundBtn = "grid size-11 shrink-0 place-items-center rounded-full border border-separator bg-cell text-label transition active:scale-95";

/** Figma .page-header: optional back button, serif title + subtitle, optional action on the right. */
export function SquadHeader({
  title,
  subtitle,
  back,
  onBack,
  onClose,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  onBack?: () => void;
  onClose?: () => void;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 pb-[22px] pt-2.5">
      {back ? (
        <Link href={back} aria-label="Back" className={roundBtn}>
          <BackArrow />
        </Link>
      ) : onBack ? (
        <button type="button" onClick={onBack} aria-label="Back" className={roundBtn}>
          <BackArrow />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="font-serif text-[32px] font-normal leading-[1.08] tracking-[-0.025em] text-label">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-label-2">{subtitle}</p>}
      </div>
      {action}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className={`${roundBtn} text-[24px] leading-none`}>
          ×
        </button>
      )}
    </header>
  );
}

/** Dark round "+" button (Figma .round-icon.dark). */
export function PlusButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid size-11 shrink-0 place-items-center rounded-full bg-nav text-white transition active:scale-95">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}

const STOP_LABEL: Record<string, string> = { dinner: "Dinner", dessert: "Dessert", activity: "Activity" };

/** "Tonight · 7:00 PM · Dinner → Dessert" (Boston dates). */
export function whenText(room: { date: string; startTime: number; slots: readonly string[] }, now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  const day = room.date === today ? "Tonight" : new Date(`${room.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  return `${day} · ${formatMinutes(room.startTime)} · ${room.slots.map((s) => STOP_LABEL[s] ?? s).join(" → ")}`;
}

/** Figma .setup-form label: bold caption above a white rounded control. */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-4 grid gap-[7px]">
      <span className="text-[14px] font-bold text-label">{label}</span>
      {children}
      {hint && <span className="text-[13px] leading-[1.4] text-label-2">{hint}</span>}
    </div>
  );
}

export const inputCls =
  "h-[52px] w-full rounded-[15px] border border-separator bg-cell px-[14px] text-[16px] text-label outline-none placeholder:text-label-3 focus:border-tint";

/** Figma .chips button: dark when selected. */
export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-10 whitespace-nowrap rounded-full border px-4 text-[14px] font-medium transition-colors ${on ? "border-nav bg-nav text-white" : "border-separator bg-cell text-label"}`}
    >
      {children}
    </button>
  );
}

/** Search-as-you-type station field (shows the choice, tap to change). */
export function StationSearch({ label, stations, value, onChange }: { label: string; stations: readonly StationOption[]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!value);
  const name = stations.find((s) => s.id === value)?.name;
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? stations.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [query, stations]);

  if (!open && name) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${inputCls} flex items-center justify-between text-left`} aria-label={`${label}: ${name}. Change`}>
        <span className="truncate">{name}</span>
        <span className="text-[13px] font-bold text-tint">Change</span>
      </button>
    );
  }
  return (
    <div>
      <input aria-label={`${label}: search MBTA station`} placeholder="Search MBTA station" value={query} onChange={(e) => setQuery(e.target.value)} className={inputCls} />
      {results.length > 0 && (
        <div className="mt-1.5 max-h-[220px] overflow-auto rounded-[14px] bg-cell p-1.5 shadow-[0_10px_22px_rgb(48_32_63/0.08)]">
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onChange(s.id);
                setQuery("");
                setOpen(false);
              }}
              className="flex min-h-11 w-full items-center rounded-[10px] px-3 text-left text-[15px] text-label active:bg-cell-2"
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && <p className="mt-1.5 px-1 text-[13px] text-label-2">No stations match “{query.trim()}”.</p>}
    </div>
  );
}

/** Honest "not available yet" card for Figma features without a backend. */
export function Unavailable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border border-dashed border-separator bg-cell px-4 py-4">
      <b className="text-[14px] text-label">{title}</b>
      <p className="mt-1 text-[13px] leading-[1.45] text-label-2">{children}</p>
    </section>
  );
}
