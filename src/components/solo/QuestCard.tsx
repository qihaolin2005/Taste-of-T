// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Spin the T result: the place, why the model picked it, the mission, and the points.
// When the spin had to drop a filter (spin.relaxed), a "No exact matches" note sits above the
// card and the card says "Suggested for you" instead of "Your quest".
import { Button, TrainIcon } from "@/components/shared/ios";
import PlacePhoto from "@/components/shared/PlacePhoto";
import { routeMapHref } from "@/features/directions/types";
import type { SpinResult } from "@/features/spin/generateQuest";
import { distanceText, priceText } from "@/features/spin/missionText";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

/** What you asked for on this spin (the filters can change after it). */
export type SpinAsked = { craving: string; cravingLabel: string; radiusMiles: number; budget: number | null };

/** Cravings named after a place keep their capital: "Korean food", but "pizza". */
const NATIONAL = new Set(["thai", "chinese", "korean", "japanese", "vietnamese", "indian", "mexican", "italian", "mediterranean"]);

/** "We couldn't find pizza within 0.5 mi at your selected budget." Names only what was really dropped. */
function fallbackText(relaxed: SpinResult["relaxed"], asked: SpinAsked): string {
  const within = `within ${asked.radiusMiles} mi`;
  const what = asked.craving === "anything" ? "anything" : NATIONAL.has(asked.craving) ? `${asked.cravingLabel} food` : asked.cravingLabel.toLowerCase();
  const cost = asked.budget ? `your ${"$".repeat(asked.budget)} budget` : "your budget";
  if (relaxed.includes("craving") && relaxed.includes("budget")) return `We couldn't find ${what} ${within}, or anything else in ${cost}. Here's a nearby alternative that costs a bit more.`;
  if (relaxed.includes("craving")) return `We couldn't find ${what} ${within} at your selected budget. Here's a nearby alternative!`;
  return `We couldn't find ${what} ${within} in ${cost}. Here's a nearby alternative that costs a bit more.`;
}

function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M12 8.5l1.2 2.3 2.3 1.2-2.3 1.2L12 15.5l-1.2-2.3-2.3-1.2 2.3-1.2Z" />
    </svg>
  );
}

export default function QuestCard({ spin, asked, onAdjust }: { spin: SpinResult; asked?: SpinAsked | null; onAdjust?: () => void }) {
  const p = spin.place;
  const relaxed = spin.relaxed ?? []; // spins saved before this field existed
  const isFallback = relaxed.length > 0;
  const facts = [distanceText(p.distanceMiles), priceText(p.priceLevel) ?? "Price not listed", p.rating != null ? `★ ${p.rating.toFixed(1)}` : null, p.neighborhood].filter(Boolean);
  const routeHref = routeMapHref(p);
  // The note about the dropped filter comes first; the banner says it instead.
  const notes = isFallback ? spin.notes.slice(1) : spin.notes;
  return (
    <>
      {isFallback && (
        <section role="status" className="mt-4 rounded-[18px] border border-lilac bg-lavender px-4 py-3.5 text-plum">
          <div className="flex gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-cell text-tint">
              <SparkleIcon />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold leading-tight">No exact matches this time</p>
              <p className="mt-1 text-[14px] leading-[1.4] text-label-2">{asked ? fallbackText(relaxed, asked) : spin.notes[0]}</p>
              {onAdjust && (
                <button type="button" onClick={onAdjust} className="mt-2.5 min-h-9 rounded-full bg-cell px-3.5 text-[14px] font-semibold text-tint active:scale-[0.98]">
                  Adjust filters
                </button>
              )}
            </div>
          </div>
        </section>
      )}
      <section className="mt-4 overflow-hidden rounded-[20px] bg-cell shadow-[0_6px_24px_rgb(56_46_90/0.10)]">
        <PlacePhoto placeId={p.placeId} alt={p.name ?? "Your quest's restaurant"} className="h-48 w-full" priority fallback />
        <div className="bg-tint px-5 pb-4 pt-5 text-tint-fg">
          <p className="text-[13px] font-semibold uppercase tracking-wide opacity-80">{isFallback ? "Suggested for you" : "Your quest"}</p>
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
            <span className="text-label-2">{cap(spin.place.reason)}</span>
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
          {notes.map((n) => (
            <p key={n} className="text-[13px] text-label-2">
              {n}
            </p>
          ))}
          {routeHref && (
            <div className="pt-1">
              <Button href={routeHref} variant="tinted">
                <TrainIcon size={18} /> Route on the T Map
              </Button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
