// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// The squad swipe session inside a group (src/features/squads):
//   collecting -> host taps "Start Adventure" -> shortlist of 10 for the night's first stop
//   swiping    -> everyone swipes right/left on every card; live progress + top 5
//   planned    -> the final top 5, the #1 is the pick; links to claim points after eating
// Polls GET /api/rooms/[code]/session every 2 s while the tab is visible.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, CheckIcon, HeartIcon, ListRow, ListSection, StarIcon, TrainIcon } from "@/components/shared/ios";
import { routeMapHref } from "@/features/directions/types";
import { endSession, fetchSession, sendSwipe, SquadApiError, startSession, type LiveState } from "@/features/squads/client";

const POLL_MS = 2000;
const SWIPE_PX = 90;
const FLY_PX = 520;
const FLY_MS = 180;
const STOP_LABEL: Record<string, string> = { dinner: "restaurants", dessert: "dessert spots", activity: "activities" };
const price = (level: number | null) => (level ? "$".repeat(level) : null);
/** Reasons come lowercase from the recommender: "a good fit for everyone" -> "A good fit for everyone". */
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** ...and as a full sentence, for a card. */
const sentence = (s: string) => (s ? cap(s) + (/[.!?]$/.test(s) ? "" : ".") : s);

type Card = NonNullable<LiveState["deck"]>[number];

function useSession(code: string) {
  const [live, setLive] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The group is gone (deleted or expired): stop polling, it won't come back.
  const [gone, setGone] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setLive(await fetchSession(code));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof SquadApiError && err.status === 404) setGone(true);
    }
  }, [code]);
  useEffect(() => {
    if (gone) return;
    let stopped = false;
    const tick = () => {
      if (!stopped && document.visibilityState === "visible") void refresh();
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, gone]);
  return { live, setLive, error, refresh };
}

/**
 * One card. Drag it past SWIPE_PX (or tap a button, or press the arrow keys) and it flies off,
 * then reports the swipe; anything shorter springs back. Never blocked by a swipe still sending.
 */
function SwipeCard({ card, onSwipe }: { card: Card; onSwipe: (liked: boolean) => void }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const start = useRef<number | null>(null);
  const meta = [card.neighborhood, price(card.priceLevel), card.rating != null ? `★ ${card.rating.toFixed(1)}` : null].filter(Boolean).join(" · ");

  const fly = (liked: boolean) => {
    if (leaving) return;
    start.current = null;
    setLeaving(true);
    setDragging(false);
    setDx(liked ? FLY_PX : -FLY_PX);
    setTimeout(() => onSwipe(liked), FLY_MS);
  };
  const end = () => {
    if (start.current == null) return;
    start.current = null;
    setDragging(false);
    if (Math.abs(dx) >= SWIPE_PX) fly(dx > 0);
    else setDx(0);
  };
  const hint = Math.min(1, Math.abs(dx) / SWIPE_PX);

  return (
    <div className="mt-3">
      <div
        role="group"
        tabIndex={0}
        aria-label={`${card.name ?? "Place"}. Swipe right or press the right arrow to like, left to pass.`}
        className="relative cursor-grab touch-pan-y select-none rounded-[22px] bg-cell p-5 shadow-[0_12px_30px_rgb(48_32_63/0.12)] outline-none transition-[transform,opacity] ease-out focus-visible:ring-2 focus-visible:ring-tint active:cursor-grabbing"
        style={{
          transform: `translateX(${dx}px) rotate(${dx / 18}deg)`,
          opacity: leaving ? 0 : 1,
          transitionDuration: dragging ? "0ms" : `${FLY_MS}ms`,
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") fly(true);
          else if (e.key === "ArrowLeft") fly(false);
        }}
        onPointerDown={(e) => {
          if (leaving) return;
          start.current = e.clientX;
          setDragging(true);
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => start.current != null && setDx(e.clientX - start.current)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span
          className="pointer-events-none absolute right-4 top-4 rounded-full bg-tint px-3 py-1 text-[13px] font-bold tracking-wide text-tint-fg"
          style={{ opacity: dx > 0 ? hint : 0 }}
        >
          LIKE
        </span>
        <span
          className="pointer-events-none absolute left-4 top-4 rounded-full bg-cell-2 px-3 py-1 text-[13px] font-bold tracking-wide text-label-2"
          style={{ opacity: dx < 0 ? hint : 0 }}
        >
          PASS
        </span>
        <p className="pr-16 font-serif text-[26px] leading-tight text-label">{card.name ?? "A place nearby"}</p>
        {meta && <p className="mt-1 text-[15px] text-label-2">{meta}</p>}
        {card.cuisines.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {card.cuisines.slice(0, 4).map((c) => (
              <span key={c} className="rounded-full bg-lavender px-3 py-1 text-[13px] font-semibold capitalize text-plum">
                {c.replace(/-/g, " ")}
              </span>
            ))}
          </div>
        )}
        {card.reason && <p className="mt-3 text-[14px] leading-snug text-label-2">{sentence(card.reason)}</p>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="tinted" onClick={() => fly(false)} disabled={leaving}>
          ✕ Pass
        </Button>
        <Button onClick={() => fly(true)} disabled={leaving}>
          <HeartIcon size={18} /> Like
        </Button>
      </div>
    </div>
  );
}

function Progress({ live }: { live: LiveState }) {
  return (
    <ListSection header="Who's Swiping" footer={live.leftCount ? `${live.leftCount} left during swiping; their votes don't count.` : undefined}>
      {live.progress.map((p) => (
        <ListRow
          key={p.memberId}
          title={p.name}
          value={p.done ? undefined : `${p.swiped}/${p.total}`}
          accessory={p.done ? <CheckIcon size={18} className="text-tint" /> : undefined}
        />
      ))}
    </ListSection>
  );
}

function Standings({ live, header, final }: { live: LiveState; header: string; final: boolean }) {
  if (!live.standings.length) return null;
  // Once planned, tapping a pick shows the way there on the T map (the plan has its coordinates).
  const routes = new Map((final ? (live.plan?.picks ?? []) : []).map((p) => [p.place.id, routeMapHref(p.place)]));
  const footer = [final && live.plan && !live.plan.complete ? "Ended early, before everyone finished swiping." : null, final && routes.size ? "Tap a place to see how to get there by T or bus." : null]
    .filter(Boolean)
    .join(" ");
  return (
    <ListSection header={header} footer={footer || undefined}>
      {live.standings.map((s) => (
        <ListRow
          key={s.placeId}
          icon={s.rank === 1 ? <StarIcon size={16} /> : <span className="text-[14px] font-bold">{s.rank}</span>}
          title={s.name ?? s.placeId}
          subtitle={cap(s.reason)}
          href={routes.get(s.placeId) ?? undefined}
        />
      ))}
    </ListSection>
  );
}

export default function SquadSession({ code }: { code: string }) {
  const { live, error, refresh } = useSession(code);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Swipes this phone made that a poll may not show yet. Merged over the server's list so a poll
  // that started before a swipe landed can't bring the card back.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!live) return error ? <p className="mt-6 text-center text-[14px] text-label-2">{error}</p> : null;

  const notice = actionError && <p className="mt-3 rounded-[14px] bg-cell px-4 py-3 text-[14px] text-danger">{actionError}</p>;

  if (live.status === "collecting") {
    return (
      <div className="mt-6">
        {live.isHost ? (
          <>
            <Button onClick={() => act(() => startSession(code))} disabled={busy || live.progress.length === 0}>
              {busy ? "Picking 10 spots for your group…" : "Start Adventure"}
            </Button>
            <p className="mt-2 text-center text-[13px] text-label-2">
              We&apos;ll combine everyone&apos;s tastes and dietary needs into 10 places. Then everyone swipes.
            </p>
          </>
        ) : (
          <p className="text-center text-[15px] text-label-2">Waiting for the host to start the adventure…</p>
        )}
        {notice}
      </div>
    );
  }

  if (live.status === "swiping" && live.deck) {
    const mine = { ...live.mySwipes, ...pending };
    const done = live.deck.filter((c) => c.placeId in mine).length;
    const next = live.deck.find((c) => !(c.placeId in mine));
    // Only people in the round swipe: someone who joined after the host started is a member (has a
    // member id) but isn't in the progress list, and the server would refuse their swipes.
    const canSwipe = live.myMemberId != null && live.progress.some((p) => p.memberId === live.myMemberId);
    const swipe = (placeId: string, liked: boolean) => {
      setActionError(null);
      setPending((p) => ({ ...p, [placeId]: liked }));
      sendSwipe(code, placeId, liked)
        .then(() => refresh())
        .catch((err: Error) => {
          // Put the card back so they can try again.
          setPending((p) => {
            const rest = { ...p };
            delete rest[placeId];
            return rest;
          });
          setActionError(err.message);
        });
    };
    return (
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <p className="text-[15px] text-label-2">
            {live.deck.length} {STOP_LABEL[live.category ?? "dinner"] ?? "places"} to swipe
          </p>
          <p className="text-[15px] font-semibold tabular-nums text-label">
            {done}/{live.deck.length}
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cell-2" aria-hidden>
          <div className="h-full rounded-full bg-tint transition-[width] duration-300" style={{ width: `${(done / live.deck.length) * 100}%` }} />
        </div>
        {!canSwipe ? (
          <p className="mt-3 rounded-[14px] bg-cell px-4 py-4 text-[15px] text-label-2">You joined after this round started, so you can&apos;t swipe on it. You&apos;ll see the top 5 here when everyone&apos;s done.</p>
        ) : next ? (
          <SwipeCard key={next.placeId} card={next} onSwipe={(liked) => swipe(next.placeId, liked)} />
        ) : (
          <p className="mt-3 rounded-[14px] bg-cell px-4 py-4 text-center text-[15px] text-label-2">You&apos;re done! Waiting for the others…</p>
        )}
        {notice}
        <Progress live={live} />
        <Standings live={live} header="Live Top 5" final={false} />
        {live.isHost && (
          <div className="mt-4">
            <Button variant="plain" onClick={() => act(() => endSession(code))} disabled={busy}>
              End now with the votes so far
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (live.status === "planned") {
    const top = live.plan?.recommended;
    const topRoute = top ? routeMapHref(top.place) : null;
    return (
      <div className="mt-6">
        {top && (
          <div className="rounded-[22px] bg-tint p-5 text-tint-fg">
            <p className="text-[13px] font-semibold uppercase tracking-wide opacity-80">Tonight&apos;s pick</p>
            <p className="mt-1 font-serif text-[26px] leading-tight">{top.place.name ?? top.place.id}</p>
            <p className="mt-1 text-[14px] opacity-90">{sentence(top.reason)}</p>
          </div>
        )}
        {topRoute && (
          <div className="mt-3">
            <Button href={topRoute} variant="tinted">
              <TrainIcon size={18} /> Route on the T Map
            </Button>
          </div>
        )}
        <Standings live={live} header="Your Top 5" final />
        <ListSection footer="After you eat, claim points with your receipt. Taking the bus or T earns extra.">
          <ListRow title="Claim points for a meal" href="/rewards/claim" />
        </ListSection>
      </div>
    );
  }

  return null;
}
