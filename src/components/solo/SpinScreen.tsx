// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Spin the T: how far, budget, craving -> Spin (uses where you are right now) -> a quest from
// the ML recommender -> "Start Trip" records the trip, and arriving completes the quest.
"use client";

import { useEffect, useRef, useState } from "react";
import { Button, DiceIcon, ListRow, ListSection, SegmentedControl, SelectRow } from "@/components/shared/ios";
import SnapReceiptButton from "@/components/rewards/SnapReceiptButton";
import TripRecorderCard from "@/components/trips/TripRecorderCard";
import type { SpinRequest, SpinResult } from "@/features/spin/generateQuest";
import { fetchMyTrips } from "@/features/trips/client";
import type { TripView } from "@/features/trips/service";
import QuestCard, { type SpinAsked } from "./QuestCard";

// Same lists as src/features/spin/generateQuest.ts (kept here so the server module isn't bundled).
const DISTANCES = ["0.5", "1", "2", "5"] as const;
const BUDGETS = [
  { value: "1", label: "$" },
  { value: "2", label: "$$" },
  { value: "3", label: "$$$" },
  { value: "any", label: "Any" },
] as const;
const CUISINES = [
  "pizza", "ramen", "sushi", "dumplings", "noodles", "thai", "chinese", "korean", "japanese", "vietnamese",
  "indian", "mexican", "tacos", "italian", "mediterranean", "burgers", "bbq", "seafood", "boba", "ice-cream", "bakery",
] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
const CRAVINGS = [
  { value: "anything", label: "Anything" },
  { value: "dinner", label: "Dinner" },
  { value: "dessert", label: "Dessert" },
  ...CUISINES.map((c) => ({ value: c, label: cap(c) })),
] as { value: SpinRequest["craving"]; label: string }[];

const SAVED = "tot-spin"; // last spin, so leaving the page mid-trip doesn't lose the quest
const SAVED_ASKED = "tot-spin-asked"; // what that spin asked for (the fallback banner names it)

type Where = { lat: number; lng: number } | null;

function hereNow(): Promise<Where> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export default function SpinScreen() {
  const [distance, setDistance] = useState<(typeof DISTANCES)[number]>("1");
  const [budget, setBudget] = useState<(typeof BUDGETS)[number]["value"]>("2");
  const [craving, setCraving] = useState<SpinRequest["craving"]>("anything");
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedGps, setUsedGps] = useState<boolean | null>(null);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [asked, setAsked] = useState<SpinAsked | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [trip, setTrip] = useState<TripView | null>(null);
  const [awarded, setAwarded] = useState<number | null>(null);

  // Back on the page: restore the last quest and any trip still recording for it.
  useEffect(() => {
    let saved: SpinResult | null = null;
    let savedAsked: SpinAsked | null = null;
    try {
      const raw = sessionStorage.getItem(SAVED);
      saved = raw ? (JSON.parse(raw) as SpinResult) : null;
      const rawAsked = sessionStorage.getItem(SAVED_ASKED);
      if (saved && rawAsked) savedAsked = JSON.parse(rawAsked) as SpinAsked;
    } catch {
      // storage blocked: start fresh
    }
    fetchMyTrips()
      .then((trips) => {
        const open = trips.find((t) => t.status === "recording" && t.questId);
        if (saved && open && open.questId === saved.quest.id) {
          setResult(saved);
          setAsked(savedAsked);
          setTrip(open);
        }
      })
      .catch(() => {});
  }, []);

  async function spin(again: boolean) {
    setSpinning(true);
    setError(null);
    setAwarded(null);
    const exclude = again && result ? [...seen, result.place.placeId] : seen;
    const [origin] = await Promise.all([hereNow(), new Promise((r) => setTimeout(r, 700))]); // a moment of suspense
    setUsedGps(origin !== null);
    try {
      const body: SpinRequest = {
        radiusMiles: Number(distance),
        craving,
        exclude: exclude.slice(-50),
        ...(budget !== "any" ? { budget: Number(budget) } : {}),
        ...(origin ? { origin } : {}),
      };
      const res = await fetch("/api/spin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Spin failed");
      const r = data as SpinResult;
      const a: SpinAsked = { craving, cravingLabel: CRAVINGS.find((c) => c.value === craving)?.label ?? craving, radiusMiles: Number(distance), budget: budget !== "any" ? Number(budget) : null };
      setResult(r);
      setAsked(a);
      setSeen(exclude);
      setTrip(null);
      try {
        sessionStorage.setItem(SAVED, JSON.stringify(r));
        sessionStorage.setItem(SAVED_ASKED, JSON.stringify(a));
      } catch {
        // fine without it
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSpinning(false);
    }
  }

  function onTrip(t: TripView) {
    setTrip(t);
    if (t.questAwarded) setAwarded(t.questAwarded);
  }

  const onTheWay = trip?.status === "recording";
  // Arrived: the quest is done, so there's nothing left to start (Spin Again for a new one).
  const questDone = awarded != null || (trip?.status === "finished" && trip.arrived);

  return (
    <>
      {!onTheWay && (
        <>
          <div ref={filtersRef} className="scroll-mt-4" aria-hidden />
          <ListSection header="How Far?" footer="From where you are right now. Your location is only used for this spin, never saved.">
            <div className="p-3">
              <SegmentedControl options={DISTANCES.map((d) => ({ value: d, label: `${d} mi` }))} value={distance} onChange={setDistance} />
            </div>
          </ListSection>

          <ListSection header="Budget (per person)">
            <div className="p-3">
              <SegmentedControl options={BUDGETS.map((b) => ({ value: b.value, label: b.label }))} value={budget} onChange={setBudget} />
            </div>
          </ListSection>

          <ListSection header="Craving">
            <SelectRow label="I want" value={craving} options={CRAVINGS} onChange={setCraving} />
          </ListSection>

          <div className="mt-6">
            <Button onClick={() => spin(!!result)} disabled={spinning}>
              <span className={spinning ? "inline-block animate-spin" : "inline-block"}>
                <DiceIcon size={20} />
              </span>
              {spinning ? "Spinning…" : result ? "Spin Again" : "Spin"}
            </Button>
          </div>
          {error && <p className="mt-3 px-4 text-center text-[15px] text-[#ff3b30]">{error}</p>}
          {usedGps === false && !error && (
            <p className="mt-3 px-4 text-center text-[13px] text-label-2">Location is off, so this used your saved spot. Allow location for spots near you right now.</p>
          )}
          {!result && !error && (
            <p className="mt-3 px-4 text-center text-[13px] text-label-2">We&apos;ll pick a spot we think you&apos;ll love. Then go get it!</p>
          )}
        </>
      )}

      {(questDone || trip?.status === "finished") && (
        <ListSection footer="After you pay, snap the receipt: we read the total and give you points for the meal (more if you came by bus or T). The photo isn't kept.">
          <ListRow
            title={awarded ? `Quest complete! +${awarded} points` : questDone ? "You made it!" : "Trip ended"}
            subtitle="Enjoy your meal, then snap the receipt for reward points."
          />
          {result && (
            <div className="p-4">
              <SnapReceiptButton placeId={result.place.placeId} />
            </div>
          )}
        </ListSection>
      )}

      {result && (
        <>
          <QuestCard spin={result} asked={asked} onAdjust={onTheWay ? undefined : () => filtersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
          {result.place.lat != null && !questDone && (
            <TripRecorderCard
              placeId={result.place.placeId}
              questId={result.quest.id}
              startLabel="Start Trip"
              startFooter="Records your way there. Take the bus or T for travel points. Arriving completes the quest."
              current={trip}
              onChange={onTrip}
            />
          )}
        </>
      )}
    </>
  );
}
