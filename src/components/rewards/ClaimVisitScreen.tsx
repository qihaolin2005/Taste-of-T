// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// /rewards/claim: claim points for eating at a recommended place (src/features/rewards).
//   pick the place (recommended in the last 48 h) -> receipt total, time, people on the bill
//   -> optional verified bus/T ride -> optional rating -> POST /api/rewards/visits
// On submit it asks for the phone's location, so the server can confirm you're at the place
// (src/features/rewards/presence.ts). Location is checked, never stored. If it's off or denied,
// a trip you recorded there (or a verified ride) can still confirm it.
// The receipt is typed in for now (no photo reading yet); only these facts are sent and stored.
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, ListRow, ListSection, SegmentedControl, SelectRow, StarIcon, TextFieldRow } from "@/components/shared/ios";

type Claimable = { placeId: string; name: string | null; via: "squad" | "for-you"; at: string };
type Ride = { id: string | null; status: string; mode: "bus" | "t" | null; routeName: string | null; usedForReward: boolean; verifiedAt: string | null };
type Breakdown = { meal: number; spend: number; travel: number; travelMode: string; firstVisit: number; repeatFactor: number; base: number };
type Result = { points: number; xp: number; groupMultiplier: number; groupSize: number; breakdown: Breakdown; travelNote?: string; verifiedBy?: string };
type Fix = { lat: number; lng: number; accuracyM: number };

const VERIFIED: Record<string, string> = { here: "Your location", trip: "Your recorded trip", ride: "Your verified ride" };

/** The phone's location for this claim, or null if it's off, denied or slow. */
function currentFix(): Promise<Fix | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    ),
  );
}

/** "2026-11-21T19:40" in the phone's local time, for <input type="datetime-local">. */
function localNow(minutesAgo = 0): string {
  const d = new Date(Date.now() - minutesAgo * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-store" });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error?.message ?? `Request failed (${r.status})`);
  return body as T;
}

async function postJson<T>(path: string, data: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error?.message ?? `Request failed (${r.status})`);
  return body as T;
}

export default function ClaimVisitScreen({ initialPlaceId }: { initialPlaceId: string | null }) {
  const [places, setPlaces] = useState<Claimable[] | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState(initialPlaceId ?? "");
  const [total, setTotal] = useState("");
  const [diners, setDiners] = useState(1);
  const [when, setWhen] = useState(() => localNow(5));
  const [merchant, setMerchant] = useState("");
  const [rideId, setRideId] = useState("");
  const [stars, setStars] = useState(0);
  const [busy, setBusy] = useState<false | "locating" | "claiming">(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    Promise.all([getJson<{ places: Claimable[]; visitsLeftToday: number }>("/api/rewards/eligible"), getJson<{ rides: Ride[] }>("/api/rides").catch(() => ({ rides: [] }))])
      .then(([e, r]) => {
        setPlaces(e.places);
        setLeft(e.visitsLeftToday);
        setRides(r.rides.filter((x) => x.status === "verified" && x.id && !x.usedForReward));
        setPlaceId((cur) => cur || e.places[0]?.placeId || "");
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  const place = useMemo(() => places?.find((p) => p.placeId === placeId) ?? null, [places, placeId]);
  const amount = Number(total);
  const valid = place != null && Number.isFinite(amount) && amount > 0 && amount <= 2000 && when !== "";

  async function submit() {
    if (!valid || !place) return;
    setBusy("locating");
    setError(null);
    try {
      const fix = await currentFix();
      setBusy("claiming");
      const res = await postJson<Result>("/api/rewards/visits", {
        placeId: place.placeId,
        ...(fix ? { presence: fix } : {}),
        receipt: { total: Math.round(amount * 100) / 100, date: new Date(when).toISOString(), diners, ...(merchant.trim() ? { merchantName: merchant.trim() } : {}) },
        ...(rideId ? { travel: { rideId } } : {}),
      });
      // A rating also teaches the recommender (8-10 = like, 0-3 = dislike).
      if (stars > 0) await postJson("/api/ratings", { placeId: place.placeId, score: stars * 2 }).catch(() => {});
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="mt-6 text-center text-[15px] text-label-2">{loadError}</p>;
  if (!places) return <p className="mt-6 text-center text-[15px] text-label-2">Loading…</p>;

  if (result) {
    const b = result.breakdown;
    const parts = [`${b.meal} meal`, `${Math.round(b.spend)} spend`, b.travel ? `${b.travel} ${b.travelMode === "bus" ? "bus" : "T"} ride` : null, b.firstVisit ? `${b.firstVisit} first visit` : null].filter(Boolean);
    return (
      <>
        <div className="mt-3 rounded-[22px] bg-tint p-6 text-center text-tint-fg">
          <p className="text-[15px] font-semibold opacity-85">{place?.name ?? "Your visit"}</p>
          <p className="mt-1 font-serif text-[44px] leading-none">+{result.points}</p>
          <p className="mt-2 text-[14px] opacity-90">You now have {result.xp.toLocaleString("en-US")} points</p>
        </div>
        <ListSection header="How you earned it" footer={result.travelNote}>
          <ListRow title={parts.join(" + ")} />
          {b.repeatFactor < 1 && <ListRow title={`Repeat visit ×${b.repeatFactor}`} />}
          {result.verifiedBy && VERIFIED[result.verifiedBy] && <ListRow title="Visit confirmed by" value={VERIFIED[result.verifiedBy]} />}
          {result.groupSize > 1 && <ListRow title={`Group bonus ×${result.groupMultiplier}`} subtitle={`${result.groupSize} of your squad ate here. More squad-mates claiming raises everyone's bonus.`} />}
        </ListSection>
        <div className="mt-6">
          <Button href="/profile">See My Points</Button>
        </div>
      </>
    );
  }

  if (left === 0) {
    return (
      <div className="mt-3 rounded-[14px] bg-cell px-4 py-10 text-center">
        <p className="text-[17px] font-semibold">You&apos;ve claimed 2 meals today</p>
        <p className="mt-1 text-[15px] text-label-2">Points are limited to 2 meals a day. Come back tomorrow!</p>
        <div className="mt-5">
          <Button href="/profile" variant="tinted">
            See My Points
          </Button>
        </div>
      </div>
    );
  }

  if (places.length === 0) {
    return (
      <div className="mt-3 rounded-[14px] bg-cell px-4 py-10 text-center">
        <p className="text-[17px] font-semibold">Nothing to claim yet</p>
        <p className="mt-1 text-[15px] text-label-2">
          Points are for places we recommended in the last 48 hours that you haven&apos;t claimed today. Spin the T or plan an adventure with your group first.
        </p>
        <div className="mt-5">
          <Button href="/spin" variant="tinted">
            Spin the T
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ListSection header="Where did you eat?">
        <SelectRow
          label="Place"
          value={placeId}
          options={places.map((p) => ({ value: p.placeId, label: `${p.name ?? p.placeId}${p.via === "squad" ? " (group)" : ""}` }))}
          onChange={setPlaceId}
        />
      </ListSection>

      <ListSection header="Receipt" footer="Type the total from your receipt. We only keep the amount, time and restaurant name.">
        <TextFieldRow label="Total ($)" inputMode="decimal" placeholder="42.50" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ""))} />
        <TextFieldRow label="Time" type="datetime-local" value={when} max={localNow()} onChange={(e) => setWhen(e.target.value)} />
        <SelectRow label="People on bill" value={diners} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} onChange={setDiners} />
        <TextFieldRow label="Restaurant" placeholder="As on receipt (optional)" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
      </ListSection>

      <ListSection header="How did you get there?" footer={rides.length ? "Verified bus rides earn 10, T rides 5." : "Record your trip by bus or T next time for travel points."}>
        <SelectRow
          label="Ride"
          value={rideId}
          options={[{ value: "", label: "No ride" }, ...rides.map((r) => ({ value: r.id!, label: `${r.mode === "bus" ? "Bus" : "T"}${r.routeName ? ` · ${r.routeName}` : ""}` }))]}
          onChange={setRideId}
        />
      </ListSection>

      <ListSection header="How was it? (optional)" footer="Ratings make your recommendations better.">
        <div className="px-4 py-3">
          <SegmentedControl
            value={String(stars)}
            onChange={(v) => setStars(Number(v))}
            options={[{ value: "0", label: "Skip" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}★` }))]}
          />
        </div>
      </ListSection>

      {error && <p className="mt-3 rounded-[14px] bg-cell px-4 py-3 text-[14px] text-danger">{error}</p>}
      <div className="mt-6">
        <Button onClick={submit} disabled={!valid || busy !== false}>
          <StarIcon size={18} /> {busy === "locating" ? "Checking your location…" : busy ? "Claiming…" : "Claim Points"}
        </Button>
        <p className="mt-2 px-4 text-center text-[13px] text-label-2">
          We check your location to confirm you&apos;re at {place?.name ?? "the restaurant"}. It&apos;s never saved. Already left? A trip you recorded there works too.
        </p>
      </div>
    </>
  );
}
