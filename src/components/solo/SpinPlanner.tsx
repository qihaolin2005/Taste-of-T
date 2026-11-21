// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Spin the T, laid out like the Figma "Plan an Adventure" and "Your Adventure" screens.
//
// Real data only:
//   - Places come from the recommender: POST /api/me/recommendations (P1). It already uses the
//     user's tastes, dietary needs (hard filter), ratings and history; we pass where to search
//     (GPS or the chosen station, not stored), how far, and which kinds of place.
//   - Time sets the number of stops and search radius; budget filters by price level;
//     interests choose the kinds of stop. The route is built here from the ranked results.
//   - "Start Adventure" creates one quest per stop (POST /api/me/quests, P4), which then show
//     on Home; "Done" completes a quest and pays its points (POST /api/me/quests/:id/complete).
//   - "With Squad" goes to the real group-night flow (/room/new): there's no squads backend yet.
// P1's dedicated /api/spin and generatePlan() are still stubs; swap them in here when they land.
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ClockIcon, DiceIcon, DollarIcon, ForkKnifeIcon, GroupIcon, PersonIcon, ShareIcon, StarIcon, TrainIcon } from "@/components/shared/ios";
import { getMe } from "@/lib/identity";
import "./solo.css";

export type SpinStation = { id: string; name: string; lat: number; lng: number; lines: string[] };

type Category = "dinner" | "dessert" | "activity";
type Rec = {
  placeId: string;
  name: string | null;
  category: Category;
  reason: string;
  reasons: string[];
  distanceMiles: number | null;
  cuisines: string[];
  rating: number | null;
  priceLevel: number | null;
  neighborhood: string | null;
};
type RecResponse = { results: Rec[]; confidence: number; warnings: string[] };
type Quest = { id: string; title: string; points: number; status: string };

type Interest = "Food" | "Coffee" | "Desserts" | "Hidden Gems";
type Slot = "coffee" | "activity" | "dinner" | "dessert";
type Stop = Rec & { slot: Slot };

const TIMES = [
  { label: "1–2 hours", stops: 2, radiusMiles: 2 },
  { label: "3–4 hours", stops: 3, radiusMiles: 4 },
  { label: "Full day", stops: 4, radiusMiles: 8 },
] as const;
/** maxPrice = highest Google-style price level (1-4) that fits; null = any. */
const BUDGETS = [
  { label: "$15–30", value: 30, maxPrice: 2 },
  { label: "$30–50", value: 50, maxPrice: 3 },
  { label: "$50+", value: 100, maxPrice: null },
] as const;
const INTERESTS: Interest[] = ["Food", "Coffee", "Desserts", "Hidden Gems"];
const COFFEE_TAGS = new Set(["cafe", "boba", "bakery"]);

/** Route order: a drink first, then something to do, dinner, and dessert last. */
const SLOT_ORDER: Slot[] = ["coffee", "activity", "dinner", "dessert"];
const SLOT_FOR: Record<Interest, Slot> = { Food: "dinner", Coffee: "coffee", Desserts: "dessert", "Hidden Gems": "activity" };
const SLOT_LABEL: Record<Slot, string> = { coffee: "Coffee & treats", activity: "Hidden gem", dinner: "Dinner", dessert: "Dessert" };
const SLOT_VERB: Record<Slot, string> = { coffee: "Grab a drink at", activity: "Check out", dinner: "Eat at", dessert: "Get dessert at" };

const LINE_COLOR: Record<string, string> = { Red: "var(--line-red)", Mattapan: "var(--line-red)", Orange: "var(--line-orange)", Blue: "var(--line-blue)" };
const lineColor = (lines: string[] | undefined) => {
  const l = lines?.[0];
  if (!l) return "var(--tint)";
  return l.startsWith("Green") ? "var(--line-green)" : (LINE_COLOR[l] ?? "var(--tint)");
};
const lineName = (lines: string[] | undefined) => {
  const l = lines?.[0];
  if (!l) return null;
  if (l.startsWith("Green")) return "Green Line";
  return l === "Mattapan" ? "Mattapan Trolley" : `${l} Line`;
};

/** The recommender's reasons minus distance and rating, which the stop card already shows. */
function extraReasons(r: Rec): string {
  return (r.reasons ?? []).filter((x) => !/\b(mi|miles?) away\b|★|\breviews?\b/i.test(x)).join(" · ");
}

function fitsSlot(r: Rec, slot: Slot): boolean {
  if (slot === "coffee") return r.category === "dessert" && r.cuisines.some((c) => COFFEE_TAGS.has(c));
  return r.category === slot;
}

/** Turn ranked recommendations into a route: walk the chosen slots in order, best place first. */
function buildRoute(results: Rec[], interests: Interest[], stops: number, maxPrice: number | null, avoid: Set<string>): Stop[] {
  const slots = SLOT_ORDER.filter((s) => interests.some((i) => SLOT_FOR[i] === s));
  const pool = results.filter((r) => r.name && (maxPrice == null || r.priceLevel == null || r.priceLevel <= maxPrice));
  const used = new Set<string>();
  const route: Stop[] = [];
  // Prefer places not shown in the previous spin; fall back to them if nothing else fits.
  for (const allowSeen of [false, true]) {
    for (let round = 0; route.length < stops && round < stops; round++) {
      for (const slot of slots) {
        if (route.length >= stops) break;
        const pick = pool.find((r) => !used.has(r.placeId) && (allowSeen || !avoid.has(r.placeId)) && fitsSlot(r, slot));
        if (pick) {
          used.add(pick.placeId);
          route.push({ ...pick, slot });
        }
      }
    }
    if (route.length >= stops) break;
  }
  // Keep the walk in the Figma order (drink -> activity -> dinner -> dessert).
  return route.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}

function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no geolocation"));
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
    });
  });
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return json as T;
}

/* ---------- small Figma pieces ---------- */

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Back" className="grid size-11 shrink-0 place-items-center rounded-full border border-separator bg-cell text-label transition active:scale-95">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
    </button>
  );
}

/** Figma .page-header: serif title + muted subtitle, optional back button. */
function PageHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack?: () => void }) {
  return (
    <header className="flex items-center gap-3 pb-[22px] pt-2.5">
      {onBack && <BackButton onClick={onBack} />}
      <div className="min-w-0 flex-1">
        <h1 className="font-serif text-[32px] font-normal leading-[1.08] tracking-[-0.025em] text-label">{title}</h1>
        <p className="mt-1 text-[14px] text-label-2">{subtitle}</p>
      </div>
    </header>
  );
}

/** Figma .form-section: hairline on top, icon-tile title, then the control. */
function FormSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-separator py-4">
      <h2 className="mb-3 flex items-center gap-2 text-[16px] font-bold text-label">
        <span className="grid size-8 place-items-center rounded-[10px] bg-lavender text-plum">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Figma .chips: pill choices; the selected one is the dark nav color. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-10 whitespace-nowrap rounded-full border px-4 text-[14px] font-medium transition-colors ${on ? "border-nav bg-nav text-white" : "border-separator bg-cell text-label"}`}
    >
      {children}
    </button>
  );
}

function LineIcon({ children }: { children: ReactNode }) {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

function stopIcon(slot: Slot) {
  if (slot === "activity") return <StarIcon size={26} />;
  if (slot === "coffee")
    // Figma "coffee" icon
    return (
      <LineIcon>
        <path d="M4 7h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />
        <path d="M17 9h2a3 3 0 0 1 0 6h-2M7 3v2M11 3v2" />
      </LineIcon>
    );
  if (slot === "dessert")
    return (
      <LineIcon>
        <path d="M7 10a5 5 0 0 1 10 0Z" />
        <path d="M7 10l5 11 5-11" />
      </LineIcon>
    );
  return <ForkKnifeIcon size={26} />;
}

/* ---------- the screen ---------- */

type View = "planner" | "adventure";

export default function SpinPlanner({ stations }: { stations: readonly SpinStation[] }) {
  const [view, setView] = useState<View>("planner");
  const [who, setWho] = useState<"Solo" | "With Squad">("Solo");
  const [startKind, setStartKind] = useState<"location" | "station">("location");
  const [stationId, setStationId] = useState<string | null>(null);
  const [stationQuery, setStationQuery] = useState("");
  const [time, setTime] = useState<(typeof TIMES)[number]>(TIMES[1]);
  const [budget, setBudget] = useState<(typeof BUDGETS)[number]>(BUDGETS[0]);
  const [interests, setInterests] = useState<Interest[]>(["Food", "Hidden Gems"]);

  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Stop[]>([]);
  const [personal, setPersonal] = useState(false);
  const shown = useRef<Set<string>>(new Set());

  const [starting, setStarting] = useState(false);
  const [quests, setQuests] = useState<Record<string, Quest>>({}); // placeId -> quest
  const [shareNote, setShareNote] = useState<string | null>(null);

  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const station = stationId ? byId.get(stationId) : undefined;
  const results = useMemo(() => {
    const q = stationQuery.trim().toLowerCase();
    return q ? stations.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [stationQuery, stations]);

  // Prefill budget and starting station from the account's saved preferences.
  useEffect(() => {
    getMe()
      .then(({ preferences: p }) => {
        if (p.defaultBudget != null) setBudget(p.defaultBudget <= 30 ? BUDGETS[0] : p.defaultBudget <= 50 ? BUDGETS[1] : BUDGETS[2]);
        if (p.usualStartStationId) {
          setStationId(p.usualStartStationId);
          setStartKind("station");
        }
      })
      .catch(() => {});
  }, []);

  // The phone's back button returns from the adventure to the planner.
  useEffect(() => {
    const onPop = () => setView(new URLSearchParams(window.location.search).get("view") === "adventure" && route.length ? "adventure" : "planner");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [route.length]);
  // A refresh on ?view=adventure has no route in memory: drop back to the planner URL.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "adventure") window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const toggleInterest = (i: Interest) => setInterests((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
  const startLabel = startKind === "station" && station ? station.name : "Your current location";

  async function generate(again = false) {
    if (interests.length === 0) return setError("Pick at least one interest.");
    if (startKind === "station" && !station) return setError("Choose a starting station.");
    setSpinning(true);
    setError(null);
    try {
      const origin = startKind === "station" && station ? { lat: station.lat, lng: station.lng } : await getPosition().catch(() => null);
      if (!origin) throw new Error("Couldn't get your location. Choose an MBTA station instead (iPhones need the secure https link for location).");
      const categories = [...new Set(interests.map((i) => (SLOT_FOR[i] === "coffee" ? "dessert" : SLOT_FOR[i])))] as Category[];
      const res = await postJson<RecResponse>("/api/me/recommendations", { mode: { kind: "nearby", radiusMiles: time.radiusMiles }, origin, categories, limit: 50 });
      const next = buildRoute(res.results, interests, time.stops, budget.maxPrice, again ? shown.current : new Set());
      if (next.length === 0) throw new Error(res.warnings[0] ?? "No places match that budget and those interests nearby. Try a bigger budget, more time, or other interests.");
      next.forEach((s) => shown.current.add(s.placeId));
      setRoute(next);
      setPersonal(res.confidence > 0);
      setQuests({});
      setShareNote(null);
      if (!again) {
        window.history.pushState(null, "", `${window.location.pathname}?view=adventure`);
        setView("adventure");
        window.scrollTo(0, 0);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSpinning(false);
    }
  }

  async function startAdventure() {
    setStarting(true);
    setError(null);
    try {
      const made: Record<string, Quest> = {};
      for (const s of route) {
        const title = `${SLOT_VERB[s.slot]} ${s.name}`.slice(0, 80);
        const { quest } = await postJson<{ quest: Quest }>("/api/me/quests", { title, ...(startKind === "station" && station ? { stationId: station.id } : {}) });
        made[s.placeId] = quest;
      }
      setQuests(made);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function complete(placeId: string) {
    const q = quests[placeId];
    if (!q || q.status === "completed") return;
    try {
      const { quest } = await postJson<{ quest: Quest }>(`/api/me/quests/${q.id}/complete`);
      setQuests((cur) => ({ ...cur, [placeId]: quest }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function share() {
    const text = `My Taste of T adventure from ${startLabel}:\n${route.map((s, i) => `${i + 1}. ${s.name}`).join("\n")}`;
    const copy = async () => {
      await navigator.clipboard.writeText(`${text}\n${window.location.origin}`);
      setShareNote("Copied! Paste it to your squad.");
    };
    try {
      if (navigator.share) await navigator.share({ title: "Taste of T adventure", text, url: window.location.origin });
      else await copy();
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // they closed the share sheet
      // Share sheet unavailable or refused: fall back to the clipboard.
      await copy().catch(() => setShareNote("Couldn't share from this browser."));
    }
  }

  function backToPlanner() {
    if (new URLSearchParams(window.location.search).get("view") === "adventure") window.history.back();
    else setView("planner");
  }

  const started = Object.keys(quests).length > 0;
  const questPoints = Object.values(quests).reduce((n, q) => n + q.points, 0);
  const doneCount = Object.values(quests).filter((q) => q.status === "completed").length;
  const rail = startKind === "station" ? lineColor(station?.lines) : "var(--tint)";

  /* ---------- planner ---------- */
  if (view === "planner") {
    return (
      <div className="tot-spin-view">
        <PageHeader title="Plan an Adventure" subtitle="Build a little adventure around Boston." />

        <FormSection icon={<GroupIcon size={17} />} title="Who’s going?">
          <div className="grid grid-cols-2 gap-2.5">
            {(["Solo", "With Squad"] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={who === w}
                onClick={() => setWho(w)}
                className={`flex h-[74px] items-center justify-center gap-2.5 rounded-[17px] border text-[15px] font-semibold text-label transition-colors ${
                  who === w ? "border-[#9c8ced] bg-lilac" : "border-separator bg-cell"
                }`}
              >
                {w === "Solo" ? <PersonIcon size={20} /> : <GroupIcon size={20} />}
                {w}
              </button>
            ))}
          </div>
        </FormSection>

        {who === "With Squad" ? (
          // No squads backend: group adventures run through the real group-night rooms.
          <section className="mb-2 rounded-[18px] border border-dashed border-separator bg-cell px-4 py-5 text-center">
            <span className="mx-auto mb-2.5 grid size-10 place-items-center rounded-[13px] bg-lavender text-plum">
              <GroupIcon size={20} />
            </span>
            <b className="text-[15px] text-label">Plan it with your group</b>
            <p className="mx-auto mb-3.5 mt-1 max-w-[290px] text-[13px] leading-[1.45] text-label-2">
              Start a group night and share the code. Everyone adds their budget and station, and the plan works for the whole group.
            </p>
            <Link href="/room/new" className="mx-auto flex min-h-11 max-w-[260px] items-center justify-center rounded-full bg-nav px-5 text-[14px] font-bold text-white transition active:scale-[0.98]">
              Start or join a group night
            </Link>
          </section>
        ) : (
          <>
            <FormSection icon={<TrainIcon size={17} />} title="Starting point">
              <div className="grid gap-2">
                {(
                  [
                    ["location", "Current Location"],
                    ["station", "Choose MBTA Station"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={startKind === k}
                    onClick={() => setStartKind(k)}
                    className={`flex min-h-12 items-center justify-between rounded-[14px] border px-[14px] text-[15px] text-label transition-colors ${
                      startKind === k ? "border-[#b69fe3] bg-lavender" : "border-separator bg-cell"
                    }`}
                  >
                    <span>{k === "station" && station ? station.name : label}</span>
                    <i className="grid size-[18px] place-items-center rounded-full border border-label-3 not-italic">{startKind === k && <em className="size-[9px] rounded-full bg-tint" />}</i>
                  </button>
                ))}
              </div>
              {startKind === "station" && (
                <div className="mt-2">
                  <input
                    aria-label="Search MBTA station"
                    placeholder={station ? `Change from ${station.name}` : "Search MBTA station"}
                    value={stationQuery}
                    onChange={(e) => setStationQuery(e.target.value)}
                    className="h-12 w-full rounded-[14px] border border-separator bg-cell px-[14px] text-[16px] text-label outline-none placeholder:text-label-3 focus:border-tint"
                  />
                  {results.length > 0 && (
                    <div className="mt-1.5 max-h-[220px] overflow-auto rounded-[14px] bg-cell p-1.5 shadow-[0_10px_22px_rgb(48_32_63/0.08)]">
                      {results.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setStationId(s.id);
                            setStationQuery("");
                          }}
                          className="flex min-h-11 w-full items-center justify-between rounded-[10px] px-3 text-left text-[15px] text-label active:bg-cell-2"
                        >
                          {s.name}
                          <span className="text-[12px] text-label-2">{lineName(s.lines)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </FormSection>

            <FormSection icon={<ClockIcon size={17} />} title="Available time">
              <div className="flex gap-[7px]">
                {TIMES.map((t) => (
                  <Chip key={t.label} on={time.label === t.label} onClick={() => setTime(t)}>
                    {t.label}
                  </Chip>
                ))}
              </div>
            </FormSection>

            <FormSection icon={<DollarIcon size={17} />} title="Budget">
              <div className="grid grid-cols-3 gap-[7px]">
                {BUDGETS.map((b) => (
                  <Chip key={b.label} on={budget.label === b.label} onClick={() => setBudget(b)}>
                    {b.label}
                  </Chip>
                ))}
              </div>
            </FormSection>

            <FormSection icon={<StarIcon size={17} />} title="Interests">
              <div className="flex flex-wrap gap-[7px]">
                {INTERESTS.map((i) => (
                  <Chip key={i} on={interests.includes(i)} onClick={() => toggleInterest(i)}>
                    {i}
                  </Chip>
                ))}
              </div>
            </FormSection>

            {error && (
              <p role="alert" className="mb-3 rounded-[14px] bg-[#fbeff4] px-4 py-3 text-[14px] leading-5 text-[#8c456c]">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => generate(false)}
              disabled={spinning}
              className="mt-3 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[17px] bg-tint text-[16px] font-bold text-tint-fg shadow-[0_9px_20px_rgb(121_84_172/0.18)] transition active:scale-[0.98] disabled:opacity-80"
            >
              {spinning ? (
                <>
                  <span className="tot-spin-dice">
                    <DiceIcon size={20} />
                  </span>
                  Spinning…
                </>
              ) : (
                <>
                  Generate My Adventure <StarIcon size={17} />
                </>
              )}
            </button>
          </>
        )}
      </div>
    );
  }

  /* ---------- adventure ---------- */
  return (
    <div className="tot-spin-view">
      <PageHeader title="Your Adventure" subtitle="A route made just for you." onBack={backToPlanner} />

      <div className="mb-[18px] flex flex-wrap gap-1.5">
        {[time.label, `${route.length} ${route.length === 1 ? "stop" : "stops"}`, budget.label, ...(started ? [`+${questPoints} pts`] : [])].map((c) => (
          <span key={c} className="rounded-full bg-lavender px-3 py-1.5 text-[13px] font-medium text-plum">
            {c}
          </span>
        ))}
      </div>
      <p className="-mt-2 mb-3.5 flex items-center gap-1.5 text-[12px] font-bold text-tint">
        <StarIcon size={13} /> {personal ? "Personalized with your tastes and history" : "Top picks nearby. Rate places to personalize these."}
      </p>

      {/* Figma .route-start */}
      <section className="flex items-center gap-[13px] rounded-[17px] bg-plum p-[13px] text-grouped">
        <span className="size-4 shrink-0 rounded-full border-4 border-white" style={{ background: rail }} />
        <div className="grid gap-0.5">
          <small className="text-[11px] font-semibold uppercase tracking-[0.06em] opacity-70">
            Start{startKind === "station" && lineName(station?.lines) ? ` · ${lineName(station?.lines)}` : ""}
          </small>
          <b className="text-[16px]">{startLabel}</b>
        </div>
      </section>

      {/* Figma .timeline */}
      <ol className="mt-1">
        {route.map((s, i) => {
          const q = quests[s.placeId];
          const done = q?.status === "completed";
          return (
            <li key={s.placeId} className="tot-spin-stop grid min-h-[118px] grid-cols-[27px_70px_1fr_auto] items-center gap-[10px]" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="flex h-full items-center border-l-2" style={{ borderColor: rail, marginLeft: 12 }}>
                <span
                  className="-ml-[12.5px] grid size-6 place-items-center rounded-full border-2 bg-cell text-[11px] font-extrabold text-label"
                  style={{ borderColor: rail, ...(done ? { background: rail, color: "white" } : {}) }}
                >
                  {done ? "✓" : i + 1}
                </span>
              </div>
              <span className="grid h-[74px] w-[70px] place-items-center rounded-[15px] bg-lavender text-plum">{stopIcon(s.slot)}</span>
              <div className="min-w-0 py-2">
                <small className="text-[11px] font-semibold uppercase tracking-[0.05em] text-label-2">
                  {SLOT_LABEL[s.slot]}
                  {s.neighborhood ? ` · ${s.neighborhood}` : ""}
                </small>
                <h3 className="my-0.5 text-[16px] font-bold leading-tight text-label">{s.name}</h3>
                <p className="text-[13px] text-label-2">
                  {[s.distanceMiles != null ? `${s.distanceMiles.toFixed(1)} mi` : null, s.priceLevel ? "$".repeat(s.priceLevel) : null, s.rating ? `★ ${s.rating.toFixed(1)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {extraReasons(s) && <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.35] text-tint">{extraReasons(s)}</p>}
              </div>
              {q ? (
                <button
                  type="button"
                  onClick={() => complete(s.placeId)}
                  disabled={done}
                  className={`min-h-9 rounded-[10px] px-2.5 text-[12px] font-bold transition active:scale-95 ${done ? "bg-[#cde8d6] text-[#285e3a]" : "bg-lavender text-plum"}`}
                >
                  {done ? `+${q.points}` : "Done"}
                </button>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="mb-3 rounded-[14px] bg-[#fbeff4] px-4 py-3 text-[14px] leading-5 text-[#8c456c]">
          {error}
        </p>
      )}

      <div className="mt-2 grid gap-[9px]">
        {started ? (
          <>
            <div className="flex min-h-[54px] items-center justify-center gap-2 rounded-[17px] bg-[#cde8d6] px-4 text-center text-[15px] font-bold text-[#285e3a]">
              ✓ Adventure started · {doneCount} of {route.length} done
            </div>
            <div className="grid grid-cols-[1fr_1.5fr] gap-2">
              <Link href="/" className="flex min-h-[46px] items-center justify-center rounded-[14px] bg-lavender text-[14px] font-bold text-plum active:scale-[0.98]">
                Return Home
              </Link>
              <Link href="/map" className="flex min-h-[46px] items-center justify-center rounded-[14px] bg-plum text-[14px] font-bold text-grouped active:scale-[0.98]">
                Open the T Map
              </Link>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={startAdventure}
              disabled={starting || spinning}
              className="flex min-h-[54px] items-center justify-center gap-2 rounded-[17px] bg-tint text-[16px] font-bold text-tint-fg shadow-[0_9px_20px_rgb(121_84_172/0.18)] transition active:scale-[0.98] disabled:opacity-70"
            >
              {starting ? "Starting…" : "Start Adventure →"}
            </button>
            <div className="grid grid-cols-[1fr_1.5fr] gap-2">
              <button
                type="button"
                onClick={() => generate(true)}
                disabled={spinning || starting}
                className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-[14px] border border-separator bg-cell text-[14px] font-bold text-label active:scale-[0.98] disabled:opacity-60"
              >
                <span className={spinning ? "tot-spin-dice" : ""}>
                  <DiceIcon size={17} />
                </span>
                Spin again
              </button>
              <button
                type="button"
                onClick={share}
                className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-[14px] border border-separator bg-cell text-[14px] font-bold text-label active:scale-[0.98]"
              >
                <ShareIcon size={16} /> Share With Squad
              </button>
            </div>
          </>
        )}
        {shareNote && (
          <p role="status" className="text-center text-[13px] text-label-2">
            {shareNote}
          </p>
        )}
      </div>
    </div>
  );
}
