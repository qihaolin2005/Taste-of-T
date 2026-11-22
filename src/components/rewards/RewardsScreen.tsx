// Owner: P4 - Game Layer & Map (see TEAM.md)
// /rewards: your points, rewards to spend them on (GET /api/shop, POST /api/shop/redeem), your
// vouchers, and the achievements that earn more.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ListRow, ListSection, StarIcon } from "@/components/shared/ios";
import GameIcon from "@/components/game/GameIcon";
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS } from "@/features/gamification/achievements";
import type { Reward, Voucher } from "@/features/gamification/shop";

type Shop = { balance: number; rewards: Reward[]; vouchers: Voucher[] };

const pts = (n: number) => n.toLocaleString("en-US");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { cache: "no-store", ...init });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error?.message ?? `Request failed (${r.status})`);
  return body as T;
}

function RewardCard({ reward, balance, onRedeemed }: { reward: Reward; balance: number; onRedeemed: (v: Voucher, balance: number) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const affordable = balance >= reward.cost;
  const progress = Math.min(1, balance / reward.cost);

  async function redeem() {
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ voucher: Voucher; balance: number }>("/api/shop/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rewardKey: reward.key }),
      });
      setConfirming(false);
      onRedeemed(r.voucher, r.balance);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ios-row px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-lavender text-plum" aria-hidden>
          <GameIcon name={reward.icon} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[16px] font-semibold leading-[22px]">{reward.title}</p>
            <span className="shrink-0 rounded-full bg-lavender px-2 py-0.5 text-[13px] font-bold text-plum">{pts(reward.cost)} pts</span>
          </div>
          <p className="mt-0.5 text-[14px] leading-5 text-label-2">{reward.description}</p>
          {affordable ? (
            confirming ? (
              <div className="mt-3 flex items-center gap-2">
                <button type="button" onClick={redeem} disabled={busy} className="flex-1 rounded-full bg-tint px-4 py-2 text-[14px] font-bold text-tint-fg active:scale-[0.98] disabled:opacity-50">
                  {busy ? "Redeeming…" : `Spend ${pts(reward.cost)} points`}
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-full bg-cell-2 px-4 py-2 text-[14px] font-semibold text-label-2">
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="mt-3 w-full rounded-full bg-lavender px-4 py-2 text-[14px] font-bold text-plum active:scale-[0.98]">
                Redeem
              </button>
            )
          ) : (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-cell-2">
                <div className="h-full rounded-full bg-tint" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="mt-1 text-[12px] text-label-2">{pts(reward.cost - balance)} more points to go</p>
            </div>
          )}
          {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export default function RewardsScreen() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Voucher | null>(null);

  const load = useCallback(() => {
    call<Shop>("/api/shop").then(setShop, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) return <p className="mt-6 text-center text-[15px] text-label-2">{error}</p>;
  if (!shop) return <p className="mt-6 text-center text-[15px] text-label-2">Loading…</p>;

  const onRedeemed = (voucher: Voucher, balance: number) => {
    setShop((s) => s && { ...s, balance, vouchers: [voucher, ...s.vouchers] });
    setFresh(voucher);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const active = shop.vouchers.filter((v) => !v.expired);

  return (
    <>
      <div className="mt-3 rounded-[22px] bg-tint p-5 text-tint-fg">
        <p className="text-[13px] font-semibold uppercase tracking-wide opacity-80">Your points</p>
        <p className="mt-1 font-serif text-[44px] leading-none">{pts(shop.balance)}</p>
        <p className="mt-2 text-[14px] opacity-90">Earn points when you arrive at a Spin quest, claim a meal with your receipt, or unlock achievements. Spend them below.</p>
      </div>

      {fresh && (
        <div className="mt-3 rounded-[18px] border-2 border-dashed border-tint bg-cell p-4 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-tint">Redeemed!</p>
          <p className="mt-1 flex items-center justify-center gap-2 text-[17px] font-semibold">
            <GameIcon name={fresh.reward.icon} size={20} className="text-tint" /> {fresh.reward.title}
          </p>
          <p className="mt-2 font-mono text-[24px] font-bold tracking-wider">{fresh.code}</p>
          <p className="mt-1 text-[13px] text-label-2">Show this code at the counter. Good until {day(fresh.expiresAt)}.</p>
          <button type="button" onClick={() => setFresh(null)} className="mt-2 text-[14px] font-semibold text-tint">
            Done
          </button>
        </div>
      )}

      <ListSection header="Redeem" footer="Example partner rewards for the demo.">
        {shop.rewards.map((r) => (
          <RewardCard key={r.key} reward={r} balance={shop.balance} onRedeemed={onRedeemed} />
        ))}
      </ListSection>

      {active.length > 0 && (
        <ListSection header="My Vouchers" footer="Each code works once. Show it at the counter before it expires.">
          {active.map((v) => (
            <ListRow key={v.id} icon={<GameIcon name={v.reward.icon} size={18} />} title={v.reward.title} subtitle={`${v.code} · good until ${day(v.expiresAt)}`} />
          ))}
        </ListSection>
      )}

      {ACHIEVEMENT_CATEGORIES.map((c) => (
        <ListSection key={c.key} header={c.key === "transit" ? `Achievements · ${c.title}` : c.title}>
          {ACHIEVEMENTS.filter((a) => a.category === c.key).map((a) => (
            <ListRow
              key={a.key}
              icon={<GameIcon name={a.icon} size={18} />}
              title={a.title}
              subtitle={a.description}
              value={<span className="font-semibold text-tint">+{a.points}</span>}
            />
          ))}
        </ListSection>
      ))}

      <ListSection footer="Ate at a spot we recommended in the last 48 hours? Scan your receipt: 20 points for the meal, more for what you spend, +10 for a first visit, and +5 (T) or +10 (bus) with a verified ride.">
        <ListRow icon={<StarIcon size={17} />} title="Claim points for a meal" href="/rewards/claim" />
      </ListSection>

      <div className="mt-6">
        <Button href="/spin" variant="tinted">
          Spin the T to earn more
        </Button>
      </div>
    </>
  );
}
