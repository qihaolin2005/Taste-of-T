// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// The squad swipe session inside a group (src/features/squads):
//   collecting -> host taps "Start Adventure" -> shortlist of 10 for the night's first stop
//   swiping    -> everyone swipes right/left on every card; live progress + top 5
//   planned    -> the final top 5, the #1 is the pick; links to claim points after eating
// Polls GET /api/rooms/[code]/session every 2 s while the tab is visible.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, CheckIcon, HeartIcon, ListRow, ListSection, StarIcon } from "@/components/shared/ios";
import { endSession, fetchSession, sendSwipe, startSession, type LiveState } from "@/features/squads/client";

const POLL_MS = 2000;
const SWIPE_PX = 90;
const STOP_LABEL: Record<string, string> = { dinner: "restaurants", dessert: "dessert spots", activity: "activities" };
const price = (level: number | null) => (level ? "$".repeat(level) : null);

type Card = NonNullable<LiveState["deck"]>[number];

function useSession(code: string) {
  const [live, setLive] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setLive(await fetchSession(code));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [code]);
  useEffect(() => {
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
  }, [refresh]);
  return { live, setLive, error, refresh };
}

function SwipeCard({ card, onSwipe, busy }: { card: Card; onSwipe: (liked: boolean) => void; busy: boolean }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const meta = [card.neighborhood, price(card.priceLevel), card.rating != null ? `★ ${card.rating.toFixed(1)}` : null].filter(Boolean).join(" · ");
  const end = () => {
    if (start.current == null) return;
    start.current = null;
    setDragging(false);
    if (Math.abs(dx) >= SWIPE_PX && !busy) onSwipe(dx > 0);
    setDx(0);
  };
  return (
    <div className="mt-3">
      <div
        role="group"
        aria-label={`${card.name ?? "Place"}. Swipe right to like, left to pass.`}
        className="relative touch-pan-y select-none rounded-[22px] bg-cell p-5 shadow-[0_12px_30px_rgb(48_32_63/0.12)] transition-transform"
        style={{ transform: `translateX(${dx}px) rotate(${dx / 20}deg)`, transitionDuration: dragging ? "0ms" : "200ms" }}
        onPointerDown={(e) => {
          start.current = e.clientX;
          setDragging(true);
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => start.current != null && setDx(e.clientX - start.current)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {dx > 30 && <span className="absolute right-4 top-4 rounded-full bg-tint px-3 py-1 text-[13px] font-bold text-tint-fg">LIKE</span>}
        {dx < -30 && <span className="absolute left-4 top-4 rounded-full bg-cell-2 px-3 py-1 text-[13px] font-bold text-label-2">NOPE</span>}
        <p className="font-serif text-[26px] leading-tight text-label">{card.name ?? "A place nearby"}</p>
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
        <p className="mt-3 text-[14px] text-label-2">{card.reason}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="tinted" onClick={() => onSwipe(false)} disabled={busy}>
          ✕ Pass
        </Button>
        <Button onClick={() => onSwipe(true)} disabled={busy}>
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
  return (
    <ListSection header={header} footer={final && live.plan && !live.plan.complete ? "Ended early, before everyone finished swiping." : undefined}>
      {live.standings.map((s) => (
        <ListRow
          key={s.placeId}
          icon={s.rank === 1 ? <StarIcon size={16} /> : <span className="text-[14px] font-bold">{s.rank}</span>}
          title={s.name ?? s.placeId}
          subtitle={s.reason}
          href={final && s.status !== "not-voted" ? `/rewards/claim?placeId=${encodeURIComponent(s.placeId)}` : undefined}
        />
      ))}
    </ListSection>
  );
}

export default function SquadSession({ code }: { code: string }) {
  const { live, setLive, error, refresh } = useSession(code);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
    const next = live.deck.find((c) => !(c.placeId in live.mySwipes));
    const canSwipe = live.myMemberId != null;
    const swipe = (liked: boolean) =>
      next &&
      act(async () => {
        // Show the next card right away; the poll confirms.
        setLive({ ...live, mySwipes: { ...live.mySwipes, [next.placeId]: liked } });
        await sendSwipe(code, next.placeId, liked);
      });
    return (
      <div className="mt-6">
        <p className="text-[15px] text-label-2">
          Swipe on {live.deck.length} {STOP_LABEL[live.category ?? "dinner"] ?? "places"} · {Object.keys(live.mySwipes).length}/{live.deck.length} done
        </p>
        {!canSwipe ? (
          <p className="mt-3 rounded-[14px] bg-cell px-4 py-4 text-[15px] text-label-2">You&apos;re not part of this round. Join before the next one.</p>
        ) : next ? (
          <SwipeCard key={next.placeId} card={next} onSwipe={swipe} busy={busy} />
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
    return (
      <div className="mt-6">
        {top && (
          <div className="rounded-[22px] bg-tint p-5 text-tint-fg">
            <p className="text-[13px] font-semibold uppercase tracking-wide opacity-80">Tonight&apos;s pick</p>
            <p className="mt-1 font-serif text-[26px] leading-tight">{top.place.name ?? top.place.id}</p>
            <p className="mt-1 text-[14px] opacity-90">{top.reason}</p>
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
