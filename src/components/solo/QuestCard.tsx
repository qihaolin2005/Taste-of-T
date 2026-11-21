// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Spin the T result: the place, why the model picked it, the mission, and the points.
import type { SpinResult } from "@/features/spin/generateQuest";
import { distanceText, priceText } from "@/features/spin/missionText";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

export default function QuestCard({ spin }: { spin: SpinResult }) {
  const p = spin.place;
  const facts = [distanceText(p.distanceMiles), priceText(p.priceLevel), p.rating != null ? `★ ${p.rating.toFixed(1)}` : null, p.neighborhood].filter(Boolean);
  return (
    <section className="mt-4 overflow-hidden rounded-[20px] bg-cell shadow-[0_6px_24px_rgb(56_46_90/0.10)]">
      <div className="bg-tint px-5 pb-4 pt-5 text-tint-fg">
        <p className="text-[13px] font-semibold uppercase tracking-wide opacity-80">Your quest</p>
        <h2 className="mt-1 font-serif text-[28px] leading-tight">{p.name ?? "Mystery spot"}</h2>
        <p className="mt-1 text-[15px] opacity-90">{facts.join(" · ")}</p>
      </div>
      <div className="space-y-3 px-5 py-4">
        {p.cuisines.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {p.cuisines.slice(0, 4).map((c) => (
              <span key={c} className="rounded-full bg-lavender px-2.5 py-1 text-[13px] font-semibold text-tint">
                {cap(c)}
              </span>
            ))}
          </div>
        )}
        <p className="text-[15px] leading-5">
          <span className="font-semibold">Why this spot: </span>
          <span className="text-label-2">{spin.place.reason}</span>
        </p>
        <p className="text-[15px] leading-5">
          <span className="font-semibold">Mission: </span>
          <span className="text-label-2">{spin.mission}</span>
        </p>
        <div className="flex items-center justify-between pt-1">
          <span className="rounded-full bg-tint/15 px-3 py-1 text-[15px] font-semibold text-tint">+{spin.quest.points} points</span>
          <span className="text-[12px] text-label-3">
            Picked from your top {spin.pool} of {spin.found} nearby
          </span>
        </div>
        {spin.notes.map((n) => (
          <p key={n} className="text-[13px] text-label-2">
            {n}
          </p>
        ))}
      </div>
    </section>
  );
}
