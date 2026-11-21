// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// First-run onboarding from the Figma design: 4 steps + "you're all set".
//   1 basics     -> display name                       (PATCH /api/me)
//   2 food       -> cuisines, dietary needs, foods to skip (PATCH /api/me/preferences)
//   3 trip       -> budget + starting station / location  (PATCH /api/me/preferences, PUT /api/me/location)
//   4 people     -> invite link only (no friends backend yet; nothing fake)
//   done         -> after POST /api/me/onboarding marks the account onboarded
// Dietary needs are hard constraints for the planner and ML model; cuisines feed the recommender.
// Each step has its own ?step= URL so the phone's back button walks back through the steps.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StationOption } from "@/components/shared/StationPicker";
import { completeOnboarding, getMe, savePreferences, shareCurrentLocation, updateProfile, type DietaryNeed } from "@/lib/identity";
import { AuthField, AuthTitle, ChipGroup, Icon, Spinner, StepHeader, primaryButton, secondaryButton, serif, textButton } from "./authUi";
import "./auth-intro.css";

/** Default name from the schema: means they haven't told us their name yet. */
const DEFAULT_NAME = "T Explorer";
const TOTAL = 4;
type Step = 1 | 2 | 3 | 4 | "done";

/** Figma cuisine chips -> recommender taste tags (src/features/ml/vocab.ts TASTE_VOCAB). */
const CUISINES: { value: string; label: string; tags: string[] }[] = [
  { value: "italian", label: "Italian", tags: ["italian"] },
  { value: "japanese", label: "Japanese", tags: ["japanese"] },
  { value: "korean", label: "Korean", tags: ["korean"] },
  { value: "chinese", label: "Chinese", tags: ["chinese"] },
  { value: "thai", label: "Thai", tags: ["thai"] },
  { value: "mexican", label: "Mexican", tags: ["mexican"] },
  { value: "mediterranean", label: "Mediterranean", tags: ["mediterranean"] },
  { value: "american", label: "American", tags: ["american"] },
  { value: "indian", label: "Indian", tags: ["indian"] },
  { value: "bakery", label: "Bakery & Desserts", tags: ["bakery", "dessert"] },
  { value: "cafe", label: "Coffee & Tea", tags: ["cafe", "boba"] },
  { value: "any", label: "Open to Anything", tags: [] },
];

/** Figma dietary chips. Values are the backend's fixed DIETARY_VOCAB, plus an exclusive "none". */
const DIETARY: { value: DietaryNeed | "none"; label: string }[] = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
  { value: "gluten-free", label: "Gluten-free" },
  { value: "dairy-free", label: "Dairy-free" },
  { value: "nut-free", label: "Nut allergy" },
  { value: "none", label: "No restrictions" },
];
const DIETARY_VALUES = new Set(DIETARY.map((d) => d.value));

/** Kept from the original onboarding: foods the planner should avoid. */
const SKIP_OPTIONS = ["seafood", "shellfish", "pork", "beef", "spicy", "sushi"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }));

/** Figma budget options -> defaultBudget (max dollars per person; the ML scales by $100). */
const BUDGETS = [
  { label: "$15–30", value: 30 },
  { label: "$30–50", value: 50 },
  { label: "$50+", value: 100 },
];

type Start = { kind: "station"; id: string } | { kind: "location"; nearestStationId: string | null } | null;

function toggle(set: ReadonlySet<string>, v: string): Set<string> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

/** Toggle with one exclusive option (e.g. "No restrictions"): picking it clears the rest and vice versa. */
function toggleExclusive(set: ReadonlySet<string>, v: string, exclusive: string): Set<string> {
  if (v === exclusive) return set.has(v) ? new Set() : new Set([v]);
  const next = toggle(set, v);
  next.delete(exclusive);
  return next;
}

function stepFromUrl(): 1 | 2 | 3 | 4 {
  const n = Number(new URLSearchParams(window.location.search).get("step"));
  return n === 2 || n === 3 || n === 4 ? n : 1;
}

function ChoiceLabel({ children }: { children: string }) {
  return <h2 className="mb-2.5 mt-6 text-[16px] font-bold text-[#30203F]">{children}</h2>;
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mt-4 rounded-[16px] border border-[#E7C6D6] bg-[#FBEFF4] px-4 py-3 text-[14px] leading-5 text-[#8C456C]">
      {message}
    </div>
  );
}

export default function OnboardingForm({ stations }: { stations: readonly StationOption[] }) {
  const [step, setStep] = useState<Step>(1);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Answers (prefilled from the account when it already has them).
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [cuisines, setCuisines] = useState<Set<string>>(new Set());
  const [dietary, setDietary] = useState<Set<string>>(new Set());
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [budget, setBudget] = useState<number>(BUDGETS[0].value);
  const [start, setStart] = useState<Start>(null);
  const [stationQuery, setStationQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  // How many steps we pushed onto browser history, so Back can pop instead of piling up entries.
  const pushed = useRef(0);

  useEffect(() => {
    getMe()
      .then(({ user, preferences: p }) => {
        if (user.displayName !== DEFAULT_NAME) {
          setName(user.displayName);
          setSavedName(user.displayName);
        }
        const tastes = new Set(p.tastes);
        setCuisines(new Set(CUISINES.filter((c) => c.tags.length > 0 && c.tags.every((t) => tastes.has(t))).map((c) => c.value)));
        setDietary(new Set(p.dietary.filter((d) => DIETARY_VALUES.has(d as DietaryNeed))));
        setSkip(new Set(p.avoid.filter((a) => SKIP_OPTIONS.some((o) => o.value === a))));
        if (p.defaultBudget != null) setBudget(p.defaultBudget <= 30 ? 30 : p.defaultBudget <= 50 ? 50 : 100);
        if (p.usualStartStationId) setStart({ kind: "station", id: p.usualStartStationId });
      })
      .catch(() => {
        // Not fatal: the steps still work with empty answers.
      })
      .finally(() => {
        setStep(stepFromUrl());
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    const onPop = () => {
      pushed.current = Math.max(0, pushed.current - 1);
      setError(null);
      setStep((s) => (s === "done" ? s : stepFromUrl()));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const goTo = useCallback((next: 1 | 2 | 3 | 4) => {
    window.history.pushState(null, "", `${window.location.pathname}?step=${next}`);
    pushed.current += 1;
    setError(null);
    setStep(next);
    window.scrollTo(0, 0);
  }, []);

  function back() {
    if (typeof step !== "number" || step === 1) return;
    if (pushed.current > 0) {
      window.history.back(); // popstate updates the step
    } else {
      const prev = (step - 1) as 1 | 2 | 3;
      window.history.replaceState(null, "", `${window.location.pathname}?step=${prev}`);
      setError(null);
      setStep(prev);
    }
  }

  /** Run a save, then move on. Errors stay on the current step. */
  async function save(action: () => Promise<unknown>, then: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      then();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dietaryList = (): DietaryNeed[] => [...dietary].filter((d): d is DietaryNeed => d !== "none");
  const tasteTags = (): string[] => [...new Set(CUISINES.filter((c) => cuisines.has(c.value)).flatMap((c) => c.tags))];

  // ---------- step actions ----------
  const submitBasics = () =>
    save(
      () => (name.trim() && name.trim() !== savedName ? updateProfile({ displayName: name.trim() }).then(() => setSavedName(name.trim())) : Promise.resolve()),
      () => goTo(2),
    );

  const submitFood = (skipDietary: boolean) => {
    if (skipDietary) {
      setDietary(new Set());
      setSkip(new Set());
    }
    return save(
      () => savePreferences({ tastes: tasteTags(), dietary: skipDietary ? [] : dietaryList(), avoid: skipDietary ? [] : [...skip] }),
      () => goTo(3),
    );
  };

  const submitTrip = () =>
    save(
      () =>
        savePreferences({
          defaultBudget: budget,
          usualStartStationId: start?.kind === "station" ? start.id : start?.kind === "location" ? start.nearestStationId : null,
        }),
      () => goTo(4),
    );

  const finish = () =>
    save(
      () => completeOnboarding({ dietary: dietaryList(), avoid: [...skip], ...(name.trim() ? { displayName: name.trim() } : {}) }),
      () => {
        // Onboarded now (the proxy would send /onboarding to /), so replace rather than push.
        window.history.replaceState(null, "", window.location.pathname);
        setStep("done");
        window.scrollTo(0, 0);
      },
    );

  async function locateMe() {
    setLocating(true);
    setLocationError(null);
    try {
      const loc = await shareCurrentLocation();
      setStart({ kind: "location", nearestStationId: loc.nearestStationId });
      setStationQuery("");
    } catch (err) {
      const geo = err as GeolocationPositionError;
      setLocationError(
        geo?.code === 1
          ? "Location permission was denied. Pick a station instead."
          : "Couldn't get your location. Pick a station instead (iPhones need the secure https link for location).",
      );
    } finally {
      setLocating(false);
    }
  }

  async function invite() {
    const url = window.location.origin;
    const data = { title: "Taste of T", text: "Come explore Boston food along the T with me on Taste of T.", url };
    try {
      if (navigator.share) {
        await navigator.share(data);
        setInviteNote(null);
      } else {
        await navigator.clipboard.writeText(url);
        setInviteNote("Link copied. Send it to your friends!");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setInviteNote(`Share this link: ${url}`);
    }
  }

  const stationName = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations]);
  const results = useMemo(() => {
    const q = stationQuery.trim().toLowerCase();
    if (!q) return [];
    return stations.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [stationQuery, stations]);

  // ---------- render ----------
  if (!loaded) {
    return (
      <div className="grid min-h-dvh place-items-center text-[#7954AC]" aria-busy>
        <Spinner />
      </div>
    );
  }

  if (step === "done") {
    return (
      <main
        className="tot-fade-in mx-auto flex min-h-dvh max-w-[430px] flex-col justify-between px-5 text-center"
        style={{ paddingTop: "max(24px, var(--safe-top))", paddingBottom: "max(24px, var(--safe-bottom))" }}
      >
        <div className="mt-[72px] [@media(max-height:760px)]:mt-8">
          <BostonLineArt />
          <h1 className={`${serif} mt-2 text-[40px] font-normal leading-[1.04] tracking-[-0.025em] text-[#30203F]`}>you’re all set!</h1>
          <p className="mx-auto mt-2.5 max-w-[315px] text-[16px] leading-[1.5] text-[#777080]">Your Boston adventures start here.</p>
        </div>
        <button type="button" className={`${primaryButton} mb-3`} onClick={() => window.location.replace("/")}>
          Let’s Explore <Icon name="arrow" />
        </button>
      </main>
    );
  }

  return (
    <main
      key={step}
      className="tot-fade-in mx-auto flex min-h-dvh max-w-[430px] flex-col px-5"
      style={{ paddingTop: "max(24px, var(--safe-top))", paddingBottom: "max(24px, var(--safe-bottom))" }}
    >
      <StepHeader step={step} total={TOTAL} onBack={step > 1 ? back : undefined} />

      {step === 1 && (
        <>
          <AuthTitle className="mb-5 mt-6" subtitle="Let’s make this yours.">
            first, the basics.
          </AuthTitle>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) submitBasics();
            }}
          >
            <AuthField
              id="onb-name"
              icon="user"
              label="Display name"
              placeholder="Display Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              maxLength={40}
              disabled={busy}
            />
            <p className="pl-4 text-[13px] text-[#777080]">This is how you’ll show up in group nights.</p>
          </form>
          <ErrorBox message={error} />
          <div className="mt-auto grid gap-2.5 pt-6">
            <button type="button" className={primaryButton} disabled={!name.trim() || busy} onClick={submitBasics}>
              {busy ? <Spinner /> : "Continue"}
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <AuthTitle className="mb-1 mt-6" subtitle="Pick the things you’d actually want to try.">
            what’s your kind
            <br />
            of food?
          </AuthTitle>
          <ChoiceLabel>Favorite flavors</ChoiceLabel>
          <ChipGroup label="Favorite flavors" options={CUISINES} selected={cuisines} onToggle={(v) => setCuisines((s) => toggleExclusive(s, v, "any"))} />
          <ChoiceLabel>Anything we should keep in mind?</ChoiceLabel>
          <ChipGroup label="Dietary needs" options={DIETARY} selected={dietary} onToggle={(v) => setDietary((s) => toggleExclusive(s, v, "none"))} />
          <p className="mt-2.5 pl-1 text-[13px] text-[#777080]">We’ll never suggest a place that can’t serve these.</p>
          <ChoiceLabel>Rather skip? (optional)</ChoiceLabel>
          <ChipGroup label="Foods to skip" options={SKIP_OPTIONS} selected={skip} onToggle={(v) => setSkip((s) => toggle(s, v))} />
          <ErrorBox message={error} />
          <div className="mt-auto grid gap-2.5 pt-7">
            <button type="button" className={primaryButton} disabled={busy} onClick={() => submitFood(false)}>
              {busy ? <Spinner /> : "Continue"}
            </button>
            <button type="button" className={textButton} disabled={busy} onClick={() => submitFood(true)}>
              Skip dietary preferences
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <AuthTitle className="mb-1 mt-6" subtitle="Set a default—you can always change it later.">
            let’s make it your
            <br />
            kind of trip.
          </AuthTitle>
          <ChoiceLabel>Typical budget per person?</ChoiceLabel>
          <div role="radiogroup" aria-label="Budget per person" className="grid grid-cols-2 gap-[9px]">
            {BUDGETS.map((b) => (
              <button
                key={b.value}
                type="button"
                role="radio"
                aria-checked={budget === b.value}
                onClick={() => setBudget(b.value)}
                className={`h-12 rounded-[16px] border text-[15px] font-semibold transition-colors ${
                  budget === b.value ? "border-[#A889DA] bg-[#CDBBFA] text-[#30203F]" : "border-[#DED7E7] bg-white text-[#30203F]"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <ChoiceLabel>Preferred starting station?</ChoiceLabel>
          <label className="flex h-[52px] items-center gap-2.5 rounded-[16px] border border-[#DED7E7] bg-white px-4 text-[#777080] focus-within:border-[#7954AC]">
            <Icon name="search" />
            <input
              aria-label="Search MBTA station"
              placeholder="Search MBTA station"
              value={stationQuery}
              onChange={(e) => setStationQuery(e.target.value)}
              className="w-full min-w-0 bg-transparent text-[16px] text-[#30203F] outline-none placeholder:text-[#9A93A3]"
            />
          </label>
          {stationQuery.trim() && (
            <div className="mt-1.5 max-h-[220px] overflow-auto rounded-[15px] bg-white p-1.5 shadow-[0_10px_22px_rgba(48,32,63,0.08)]">
              {results.length === 0 ? (
                <p className="px-3 py-2.5 text-[14px] text-[#777080]">No stations match “{stationQuery.trim()}”.</p>
              ) : (
                results.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setStart({ kind: "station", id: s.id });
                      setStationQuery("");
                      setLocationError(null);
                    }}
                    className="flex min-h-11 w-full items-center justify-between rounded-[10px] px-3 text-left text-[15px] text-[#30203F] active:bg-[#EEE7FC]"
                  >
                    {s.name}
                    <Icon name="plus" size={16} />
                  </button>
                ))
              )}
            </div>
          )}

          {start?.kind === "station" && (
            <OptionCard icon="train" title={stationName.get(start.id) ?? "Selected station"} detail="Your usual starting station" selected onClick={() => setStart(null)} />
          )}
          <OptionCard
            icon="pin"
            title={locating ? "Finding you…" : "Use Current Location"}
            detail={
              start?.kind === "location"
                ? start.nearestStationId
                  ? `Nearest station: ${stationName.get(start.nearestStationId) ?? start.nearestStationId}`
                  : "Location saved"
                : "We’ll ask for access only when you tap this."
            }
            selected={start?.kind === "location"}
            disabled={locating}
            onClick={() => (start?.kind === "location" ? setStart(null) : locateMe())}
          />
          {locationError && <p className="mt-2 pl-1 text-[13px] text-[#8C456C]">{locationError}</p>}
          <button
            type="button"
            className="mx-auto mt-3 block min-h-11 px-4 text-[14px] text-[#777080] active:opacity-60"
            onClick={() => {
              setStart(null);
              setStationQuery("");
              setLocationError(null);
            }}
          >
            Skip for now
          </button>

          <ErrorBox message={error} />
          <div className="mt-auto grid gap-2.5 pt-4">
            <button type="button" className={primaryButton} disabled={busy || locating} onClick={submitTrip}>
              {busy ? <Spinner /> : "Continue"}
            </button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <AuthTitle className="mb-5 mt-6" subtitle="Find your people around Boston.">
            better with friends.
          </AuthTitle>
          {/* No friends/follow backend exists yet, so no fake search or suggestions here. */}
          <section className="rounded-[20px] border border-[#E2DBE9] bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[#EEE7FC] text-[#30203F]">
                <Icon name="users" />
              </span>
              <div>
                <p className="text-[16px] font-bold text-[#30203F]">Finding friends is coming soon</p>
                <p className="mt-1 text-[14px] leading-5 text-[#777080]">
                  Soon you’ll be able to search for and follow other explorers. For now, invite friends with a link, or start a group night together from the Night tab.
                </p>
              </div>
            </div>
          </section>
          <button type="button" className={`${secondaryButton} mt-3`} onClick={invite}>
            <Icon name="share" /> Invite Friends
          </button>
          {inviteNote && (
            <p role="status" className="mt-2 text-center text-[13px] text-[#777080]">
              {inviteNote}
            </p>
          )}
          <ErrorBox message={error} />
          <div className="mt-auto grid gap-2.5 pt-7">
            <button type="button" className={primaryButton} disabled={busy} onClick={finish}>
              {busy ? <Spinner /> : "Continue"}
            </button>
            <button type="button" className={textButton} disabled={busy} onClick={finish}>
              Skip for Now
            </button>
          </div>
        </>
      )}
    </main>
  );
}

/** Figma "location-option": a selectable card with an icon, title, detail, and a check when selected. */
function OptionCard({
  icon,
  title,
  detail,
  selected,
  disabled,
  onClick,
}: {
  icon: "pin" | "train";
  title: string;
  detail: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`mt-2.5 grid min-h-[64px] w-full grid-cols-[28px_1fr_20px] items-center gap-2 rounded-[17px] border px-4 py-2.5 text-left transition-colors disabled:opacity-70 ${
        selected ? "border-[#B69FE3] bg-[#EEE7FC]" : "border-[#DED7E7] bg-white"
      }`}
    >
      <span className="text-[#7954AC]">
        <Icon name={icon} />
      </span>
      <span className="grid gap-0.5">
        <b className="text-[15px] text-[#30203F]">{title}</b>
        <small className="text-[13px] text-[#777080]">{detail}</small>
      </span>
      <span className="text-[#7954AC]">{selected && <Icon name="check" />}</span>
    </button>
  );
}

/** The Figma "BostonLineArt" skyline, unchanged. Styles: .tot-line-art in auth-intro.css. */
function BostonLineArt() {
  return (
    <svg className="tot-line-art" viewBox="0 0 360 180" aria-hidden="true">
      <g className="skyline-buildings">
        <rect x="66" y="78" width="31" height="55" rx="1" />
        <path d="M103 133V68h39v65M103 68l19-18 20 18" />
        <rect x="149" y="43" width="38" height="90" rx="1" />
        <path d="M168 43V20M163 20h10" />
        <rect x="194" y="71" width="34" height="62" rx="1" />
        <rect x="235" y="57" width="39" height="76" rx="1" />
        <path d="M280 133V82h29v51" />
      </g>
      <g className="building-details">
        <path d="M75 91h13M75 101h13M112 81h21M112 92h21M158 60h20M158 72h20M158 84h20M203 85h16M203 96h16M244 72h21M244 84h21M288 95h13" />
      </g>
      <g className="tree left-tree">
        <path d="M31 135v-17" />
        <path d="M19 118c0-8 6-13 12-10 3-8 15-7 17 2 8 0 10 13 1 16H22c-9-1-10-8-3-8Z" />
      </g>
      <g className="tree right-tree">
        <path d="M299 135v-16" />
        <path d="M287 119c0-8 6-13 12-10 4-7 15-6 17 3 8 1 9 12 0 15h-26c-8-1-9-7-3-8Z" />
      </g>
      <g className="bridge">
        <path d="M38 139h278M42 139v17M312 139v17" />
        <path d="M42 156Q87 119 132 156M132 156q45-37 90 0M222 156q45-37 90 0" />
      </g>
      <g className="river-lines">
        <path d="M55 164c18-4 31-4 48 0M132 168c20-4 37-4 57 0M220 163c18-4 33-4 51 0M87 174c15-3 28-3 43 0M253 174c13-3 26-3 39 0" />
      </g>
      <g className="mbta-sign">
        <path d="M333 75v60" />
        <circle cx="333" cy="58" r="17" />
        <text x="333" y="64" textAnchor="middle">
          T
        </text>
      </g>
    </svg>
  );
}
