// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// /room/[code]/plan: the squad's saved top 5 (GET /api/rooms/[code]/plan).
"use client";

import { useEffect, useState } from "react";
import { Button, ListRow, ListSection, StarIcon, TrainIcon } from "@/components/shared/ios";
import PlacePhoto from "@/components/shared/PlacePhoto";
import { routeMapHref } from "@/features/directions/types";
import type { SquadPlan } from "@/features/ml";

/** Reasons come lowercase from the recommender. */
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

type State = { status: "loading" } | { status: "ready"; plan: SquadPlan | null; roomStatus: string } | { status: "error"; message: string };

export default function SquadPlanView({ code }: { code: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    fetch(`/api/rooms/${encodeURIComponent(code)}/plan`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error?.message ?? "Couldn't load the plan");
        setState({ status: "ready", plan: body.plan, roomStatus: body.status });
      })
      .catch((err: Error) => setState({ status: "error", message: err.message }));
  }, [code]);

  if (state.status === "loading") return <p className="mt-6 text-center text-[15px] text-label-2">Loading…</p>;
  if (state.status === "error" || !state.plan) {
    const message =
      state.status === "error" ? state.message : state.roomStatus === "swiping" ? "Your group is still swiping." : "Start the adventure from the group page to pick tonight's spots.";
    return (
      <>
        <div className="mt-3 rounded-[14px] bg-cell px-4 py-10 text-center">
          <p className="text-[17px] font-semibold">No plan yet</p>
          <p className="mt-1 text-[15px] text-label-2">{message}</p>
        </div>
        <div className="mt-6">
          <Button href={`/room/${code}`} variant="tinted">
            Back to the Group
          </Button>
        </div>
      </>
    );
  }

  const { plan } = state;
  return (
    <>
      {plan.recommended && (
        <div className="mt-3 overflow-hidden rounded-[22px] bg-tint p-5 text-tint-fg">
          <PlacePhoto placeId={plan.recommended.place.id} alt={plan.recommended.place.name ?? "Tonight's pick"} className="-mx-5 -mt-5 mb-4 h-44" priority />
          <p className="text-[13px] font-semibold uppercase tracking-wide opacity-80">Tonight&apos;s pick</p>
          <p className="mt-1 font-serif text-[26px] leading-tight">{plan.recommended.place.name ?? plan.recommended.place.id}</p>
          <p className="mt-1 text-[14px] opacity-90">{cap(plan.recommended.reason)}</p>
        </div>
      )}
      {plan.recommended && routeMapHref(plan.recommended.place) && (
        <div className="mt-3">
          <Button href={routeMapHref(plan.recommended.place)!} variant="tinted">
            <TrainIcon size={18} /> Route on the T Map
          </Button>
        </div>
      )}
      <ListSection header="Top 5" footer={[plan.complete ? null : "Ended early, before everyone finished swiping.", "Tap a place to see how to get there by T or bus."].filter(Boolean).join(" ")}>
        {plan.picks.map((p) => (
          <ListRow
            key={p.place.id}
            icon={p.rank === 1 ? <StarIcon size={16} /> : <span className="text-[14px] font-bold">{p.rank}</span>}
            title={p.place.name ?? p.place.id}
            subtitle={cap(p.reason)}
            href={routeMapHref(p.place) ?? undefined}
          />
        ))}
      </ListSection>
      <ListSection footer="After you eat, claim points with your receipt.">
        <ListRow title="Claim points for a meal" href="/rewards/claim" />
      </ListSection>
    </>
  );
}
