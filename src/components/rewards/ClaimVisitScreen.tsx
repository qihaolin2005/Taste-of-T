// Owner: P1 - Planner & Quests (ML, rewards) (see TEAM.md)
// /rewards/claim: claim points for eating at a recommended place (src/features/rewards).
//   pick the place (recommended in the last 48 h) -> scan the receipt (Gemini reads the
//   restaurant, total and time) -> people on the bill -> optional rating
//   -> Claim: phone location + POST /api/rewards/visits
// The photo is read once and discarded; only the facts are kept. If receipt scanning isn't set
// up on the server (no GEMINI_API_KEY), the receipt is typed in instead.
// Proof you were there (src/features/rewards/presence.ts): the phone's location at the place, or
// if it's off / you already left, a trip you recorded there or a verified ride that ended nearby.
// Travel points: nobody picks "bus" or "T". The server finds your ride verified against live MBTA
// data (recorded with "Start Trip"); this screen shows whether you have one.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ListRow, ListSection, SegmentedControl, SelectRow, StarIcon, TextFieldRow, TrainIcon } from "@/components/shared/ios";
import { currentFix, scanReceiptPhoto, takePendingScan, type ScannedReceipt } from "@/features/rewards/client";

type Claimable = { placeId: string; name: string | null; via: "squad" | "for-you"; at: string };
type Ride = { id: string | null; status: string; mode: "bus" | "t" | null; routeName: string | null; usedForReward: boolean; verifiedAt: string | null };
type Breakdown = { meal: number; spend: number; travel: number; travelMode: string; firstVisit: number; repeatFactor: number; base: number };
type Result = { points: number; xp: number; groupMultiplier: number; groupSize: number; breakdown: Breakdown; travelNote?: string; verifiedBy?: string };

const VERIFIED: Record<string, string> = { here: "Your location", trip: "Your recorded trip", ride: "Your verified ride" };

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
  const [stars, setStars] = useState(0);
  const [busy, setBusy] = useState<false | "locating" | "claiming">(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // Receipt scanning (when the server has it): the read facts and the signed token for the claim.
  const [canScan, setCanScan] = useState(false);
  const [scan, setScan] = useState<ScannedReceipt | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getJson<{ places: Claimable[]; visitsLeftToday: number; receiptScan?: boolean }>("/api/rewards/eligible"), getJson<{ rides: Ride[] }>("/api/rides").catch(() => ({ rides: [] }))])
      .then(([e, r]) => {
        setPlaces(e.places);
        setLeft(e.visitsLeftToday);
        setCanScan(!!e.receiptScan);
        setRides(r.rides.filter((x) => x.status === "verified" && x.id && !x.usedForReward));
        setPlaceId((cur) => cur || e.places[0]?.placeId || "");
        // Snapped on another screen ("Snap Your Receipt" after a trip): use that scan here.
        const pending = e.receiptScan ? takePendingScan(initialPlaceId) : null;
        if (pending) {
          setScan(pending);
          if (pending.receipt.diners) setDiners(pending.receipt.diners);
        }
      })
      .catch((err: Error) => setLoadError(err.message));
  }, [initialPlaceId]);

  // Next keeps this page alive while you're on another one. When you leave, clear the finished
  // claim, so coming back (say, to claim your second meal) shows the form, not the last result.
  // The effect above runs again on return and reloads what's claimable.
  useEffect(
    () => () => {
      setResult(null);
      setError(null);
      setScan(null);
      setScanError(null);
    },
    [],
  );

  const place = useMemo(() => places?.find((p) => p.placeId === placeId) ?? null, [places, placeId]);
  const amount = Number(total);
  const typedValid = Number.isFinite(amount) && amount > 0 && amount <= 2000 && when !== "";
  const valid = place != null && (canScan ? scan != null : typedValid);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setScanning(true);
    setScanError(null);
    try {
      const s = await scanReceiptPhoto(file);
      setScan(s);
      if (s.receipt.diners) setDiners(s.receipt.diners);
    } catch (err) {
      setScan(null);
      setScanError((err as Error).message);
    } finally {
      setScanning(false);
      if (photoInput.current) photoInput.current.value = ""; // so retaking the same file fires again
    }
  }

  async function submit() {
    if (!valid || !place) return;
    setBusy("locating");
    setError(null);
    try {
      // Location at the restaurant. If it's off or fails, still claim: a recorded trip or a
      // verified ride can confirm the visit, and the server says what's missing if nothing does.
      const location = await currentFix().catch(() => null);
      setBusy("claiming");
      const res = await postJson<Result>("/api/rewards/visits", {
        placeId: place.placeId,
        ...(location ? { location } : {}),
        diners,
        ...(canScan && scan
          ? { receiptToken: scan.receiptToken }
          : { receipt: { total: Math.round(amount * 100) / 100, date: new Date(when).toISOString(), ...(merchant.trim() ? { merchantName: merchant.trim() } : {}) } }),
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

      {canScan ? (
        <ListSection header="Receipt" footer="Your photo is read once for the restaurant, total and time, then thrown away. It's never stored.">
          {scan && (
            <>
              <ListRow title="Restaurant" value={scan.receipt.merchantName} />
              <ListRow title="Total" value={`$${scan.receipt.total.toFixed(2)}`} />
              <ListRow title="Time" value={new Date(scan.receipt.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} />
            </>
          )}
          <SelectRow label="People on bill" value={diners} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} onChange={setDiners} />
          <div className="px-4 py-3">
            <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
            <Button variant={scan ? "tinted" : undefined} onClick={() => photoInput.current?.click()} disabled={scanning}>
              {scanning ? "Reading receipt…" : scan ? "Retake Photo" : "Scan Receipt"}
            </Button>
            {scanError && <p className="mt-2 text-[14px] text-danger">{scanError}</p>}
          </div>
        </ListSection>
      ) : (
        <ListSection header="Receipt" footer="Type the total from your receipt. We only keep the amount, time and restaurant name.">
          <TextFieldRow label="Total ($)" inputMode="decimal" placeholder="42.50" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ""))} />
          <TextFieldRow label="Time" type="datetime-local" value={when} max={localNow()} onChange={(e) => setWhen(e.target.value)} />
          <SelectRow label="People on bill" value={diners} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} onChange={setDiners} />
          <TextFieldRow label="Restaurant" placeholder="As on receipt (optional)" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </ListSection>
      )}

      <ListSection
        header="How Did You Get There?"
        footer={
          rides.length
            ? "A verified ride counts automatically if it ended near this place. Bus earns 10 points, T earns 5."
            : "Travel points need a ride we can verify. Before you board, tap Start Trip in My Trips (or on your Spin quest). We match your phone to the live bus or train, so there's nothing to pick here."
        }
      >
        {rides.length ? (
          rides.map((r) => (
            <ListRow
              key={r.id}
              icon={<TrainIcon size={16} />}
              title={r.routeName ?? (r.mode === "bus" ? "Bus" : "T")}
              subtitle={r.mode === "bus" ? "Bus ride" : "T ride"}
              value="Verified ✓"
            />
          ))
        ) : (
          <ListRow icon={<TrainIcon size={16} />} title="No verified ride yet" subtitle="Tap to record your next trip" href="/trips" />
        )}
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
          Claim at {place?.name ?? "the restaurant"}: we check your location once to confirm you&apos;re there. It&apos;s never saved. Already left? A trip you recorded there works too.
        </p>
      </div>
    </>
  );
}
