// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Home, laid out like the Figma Make Home screen: lavender header block with the transit
// doodle, wordmark + avatar, "hi, name!", a 2x2 stat grid, today's missions, the group-night
// strip, and the points strip. Every number is real:
//   name            GET /api/me            (lib/identity, P4)
//   points          GET /api/me/points     (usePoints, P4)
//   stations, lines GET /api/me/stamps     (useStampedStations, P4) + data/stations.json
//   missions        GET /api/me/quests?status=active (P4 API)
// Figma items with no backend yet (weekly streak, university rank, friends' activity,
// notifications, rewards shop) are left out rather than faked.
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Wordmark from "@/components/auth/Wordmark";
import { useStampedStations } from "@/components/game/map/hooks";
import { usePoints } from "@/components/game/usePoints";
import { ChevronRight, DiceIcon, ForkKnifeIcon, GroupIcon, MapIcon, MoonIcon, StarIcon, TrainIcon } from "@/components/shared/ios";
import GameIcon from "@/components/game/GameIcon";
import { REWARDS } from "@/features/gamification/shop";
import { getMe } from "@/lib/identity";
import "./home.css";

/** One station as Home needs it: id, display name, and line families (Red/Orange/Blue/Green). */
export type HomeStation = { id: string; name: string; lines: string[] };

type Quest = { id: string; title: string; stationId: string | null; points: number };

const DEFAULT_NAME = "T Explorer";
const LINE_COUNT = 4;

function greetingName(displayName: string | null): string | null {
  if (displayName == null) return null;
  if (displayName === DEFAULT_NAME) return "explorer";
  return displayName.split(/\s+/)[0].toLowerCase();
}

function TrophyIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z" />
      <path d="M7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4" />
    </svg>
  );
}

/** Figma .stat-grid article: label + big number at the bottom, badge in the top-right corner. */
function StatCard({ href, label, value, unit, badge, highlight }: { href: string; label: string; value: ReactNode; unit?: string; badge: ReactNode; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={`relative flex h-[128px] flex-col justify-end rounded-[23px] border p-[17px] shadow-[0_8px_20px_rgb(56_46_90/0.035)] backdrop-blur-[8px] transition active:scale-[0.98] ${
        highlight ? "border-lilac bg-lilac/90" : "border-cell bg-cell/85"
      }`}
    >
      <span className="text-[13px] text-label-2">{label}</span>
      <b className="mt-0.5 text-[30px] font-bold leading-[1.1] tracking-[-0.05em] text-label tabular-nums">
        {value}
        {unit && <small className="ml-1 text-[14px] font-semibold tracking-normal">{unit}</small>}
      </b>
      <span className="absolute right-[15px] top-[15px]">{badge}</span>
    </Link>
  );
}

const softBadge = "grid size-8 place-items-center rounded-full bg-lavender text-plum";

/** Figma .challenge-row: icon tile, title + detail, points pill. */
function ChallengeRow({ href, icon, title, detail, pill }: { href: string; icon: ReactNode; title: string; detail: string; pill: string }) {
  return (
    <Link
      href={href}
      className="grid min-h-[72px] w-full grid-cols-[42px_1fr_auto] items-center gap-3 rounded-[18px] border border-separator bg-cell px-[13px] py-[11px] text-left transition active:scale-[0.99] active:bg-cell-2"
    >
      <span className="grid size-[42px] place-items-center rounded-[13px] bg-lavender text-plum">{icon}</span>
      <span className="grid min-w-0 gap-0.5">
        <b className="truncate text-[15px] font-bold text-label">{title}</b>
        <small className="truncate text-[13px] text-label-2">{detail}</small>
      </span>
      <strong className="rounded-[10px] bg-lavender px-2 py-1 text-[12px] font-bold text-plum">{pill}</strong>
    </Link>
  );
}

function TransitArt() {
  // Figma .home-transit-art, unchanged.
  return (
    <svg className="tot-home-art" viewBox="0 0 353 360" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <path className="route-path" d="M-25 98C60 98 50 165 128 165s82-58 150-58 54 63 111 63" />
      <circle cx="33" cy="103" r="7" />
      <circle cx="128" cy="165" r="7" />
      <circle cx="278" cy="107" r="7" />
      <g className="train-doodle" transform="translate(228 28)">
        <rect x="0" y="0" width="82" height="72" rx="22" />
        <rect x="13" y="12" width="56" height="28" rx="9" />
        <circle cx="23" cy="55" r="7" />
        <circle cx="59" cy="55" r="7" />
        <text x="41" y="32" textAnchor="middle">
          T
        </text>
        <path d="M12 72 5 82M70 72l7 10" />
      </g>
      <circle className="t-badge" cx="330" cy="216" r="24" />
      <text className="t-letter" x="330" y="224" textAnchor="middle">
        T
      </text>
    </svg>
  );
}

export default function HomeScreen({ stations }: { stations: readonly HomeStation[] }) {
  const points = usePoints();
  const stamped = useStampedStations();
  const [name, setName] = useState<string | null>(null);
  const [quests, setQuests] = useState<Quest[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then(({ user }) => !cancelled && setName(user.displayName))
      .catch(() => !cancelled && setName(DEFAULT_NAME));
    fetch("/api/me/quests?status=active", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ quests: Quest[] }>) : { quests: [] }))
      .then(({ quests: q }) => !cancelled && setQuests(q))
      .catch(() => !cancelled && setQuests([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const visited = [...stamped].filter((id) => byId.has(id)).length;
  const linesUnlocked = new Set([...stamped].flatMap((id) => byId.get(id)?.lines ?? [])).size;
  const visitedPct = stations.length ? Math.round((visited / stations.length) * 100) : 0;
  const hi = greetingName(name);
  const total = points?.total;

  return (
    <div className="-mt-2">
      <section className="tot-home-top tot-home-in">
        <TransitArt />
        <div className="flex h-[54px] items-center justify-between">
          <div className="text-label">
            <Wordmark size="xs" tone="current" />
          </div>
          <Link
            href="/profile"
            aria-label="Profile"
            className="grid size-[40px] place-items-center rounded-full border-2 border-cell bg-lilac text-[14px] font-extrabold text-plum transition active:scale-95"
          >
            {name ? (name === DEFAULT_NAME ? "T" : name.trim()[0]?.toUpperCase()) : ""}
          </Link>
        </div>

        <div className="flex h-[104px] items-center">
          <h1 className="font-serif text-[36px] font-normal leading-[1.05] tracking-[-0.03em] text-label">
            {hi ? `hi, ${hi}!` : " "}
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            href="/profile"
            label="T Points"
            value={total == null ? "–" : total.toLocaleString("en-US")}
            badge={<i className="grid size-8 place-items-center rounded-full border-[2.5px] border-plum text-[15px] font-extrabold not-italic text-plum">T</i>}
          />
          <StatCard
            href="/map"
            label="Stations visited"
            value={visited}
            highlight
            badge={
              <i className="tot-home-ring not-italic text-plum" style={{ "--p": `${visitedPct}%` } as CSSProperties} aria-label={`${visitedPct}% of stations`}>
                <TrainIcon size={17} />
              </i>
            }
          />
          <StatCard
            href="/map"
            label="Lines unlocked"
            value={linesUnlocked}
            unit={`of ${LINE_COUNT}`}
            badge={
              <i className={`${softBadge} not-italic`}>
                <MapIcon size={17} />
              </i>
            }
          />
          <StatCard
            href="/spin"
            label="Active missions"
            value={quests == null ? "–" : quests.length}
            badge={
              <i className={`${softBadge} not-italic`}>
                <TrophyIcon />
              </i>
            }
          />
        </div>
      </section>

      <section className="tot-home-in" style={{ animationDelay: "60ms" }}>
        <div className="mb-3 mt-6 flex items-center justify-between">
          <h2 className="text-[20px] font-bold tracking-[-0.03em] text-label">Today’s Missions</h2>
          <Link href="/spin" className="whitespace-nowrap rounded-[10px] bg-tint px-3 py-1.5 text-[13px] font-bold text-tint-fg transition active:scale-95">
            Spin the T
          </Link>
        </div>
        <div className="grid gap-[9px]">
          {quests == null ? (
            <div className="h-[72px] animate-pulse rounded-[18px] bg-cell-2" aria-label="Loading missions" />
          ) : quests.length === 0 ? (
            <ChallengeRow href="/spin" icon={<DiceIcon size={20} />} title="Spin the T" detail="Get a food mission near a T station." pill="Go" />
          ) : (
            quests.slice(0, 3).map((q) => (
              <ChallengeRow
                key={q.id}
                href="/map"
                icon={q.stationId ? <TrainIcon size={18} /> : <ForkKnifeIcon size={18} />}
                title={q.title}
                detail={q.stationId ? (byId.get(q.stationId)?.name ?? "Station mission") : "Solo mission"}
                pill={`+${q.points}`}
              />
            ))
          )}
        </div>
      </section>

      {/* Figma .friends-exploring strip, used for the real group-adventure entry point. */}
      <section className="tot-home-in mt-4 grid grid-cols-[46px_1fr_auto] items-center gap-3 rounded-[18px] bg-lavender p-[13px]" style={{ animationDelay: "120ms" }}>
        <span className="grid size-[46px] place-items-center rounded-full bg-cell text-plum">
          <GroupIcon size={22} />
        </span>
        <p className="grid gap-0.5">
          <b className="text-[15px] font-bold text-label">Start an Adventure</b>
          <span className="text-[13px] leading-[1.35] text-label-2">Dinner, dessert, and fun for the group. Everyone makes the last train.</span>
        </p>
        <Link href="/room/new" className="whitespace-nowrap rounded-[10px] bg-tint px-3 py-2 text-[13px] font-bold text-tint-fg transition active:scale-95">
          Start
        </Link>
      </section>

      {/* Figma .rewards-strip, now the way into Rewards: your points, the next reward, a few to spend them on. */}
      <Link
        href="/rewards"
        className="tot-home-in mt-[15px] block w-full rounded-[16px] bg-lavender px-4 py-[14px] text-[14px] text-label transition active:scale-[0.99]"
        style={{ animationDelay: "160ms" }}
      >
        <span className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <StarIcon size={17} /> {total == null ? "Your points" : `${total.toLocaleString("en-US")} ${total === 1 ? "point" : "points"}`}
          </span>
          <b className="flex items-center gap-1 font-bold text-plum">
            Rewards <ChevronRight size={13} />
          </b>
        </span>
        {total != null && (() => {
          const next = REWARDS.find((r) => r.cost > total);
          return (
            <span className="mt-1 block text-[13px] text-label-2">
              {next ? `${(next.cost - total).toLocaleString("en-US")} more for ${next.title}` : "You can redeem any reward!"}
            </span>
          );
        })()}
        <span className="mt-2.5 flex gap-2 overflow-hidden">
          {REWARDS.slice(0, 3).map((r) => (
            <span key={r.key} className="flex shrink-0 items-center gap-1 rounded-full bg-cell px-2.5 py-1 text-[12px] font-semibold text-plum">
              <GameIcon name={r.icon} size={14} /> {r.title} · {r.cost}
            </span>
          ))}
        </span>
      </Link>

      <aside className="tot-home-in mt-4 flex items-start gap-3 rounded-[17px] border border-separator bg-cell p-[14px]" style={{ animationDelay: "200ms" }}>
        <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-lavender text-plum">
          <MoonIcon size={16} />
        </span>
        <p className="grid gap-0.5">
          <b className="text-[14px] font-bold text-label">Last trains around 12:30 AM on most lines</b>
          <span className="text-[13px] leading-[1.4] text-label-2">Boston closes early. Plans only include places open when you arrive.</span>
        </p>
      </aside>
    </div>
  );
}
