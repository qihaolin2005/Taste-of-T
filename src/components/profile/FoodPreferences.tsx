// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Profile > Food & Diet: change the cuisines, dietary needs and foods to skip picked in onboarding.
// Same options as onboarding (components/auth/foodOptions). Saves with PATCH /api/me/preferences;
// the recommender and squad shortlists use the new answers on their next run.
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, CheckIcon, ListSection } from "@/components/shared/ios";
import { CUISINES, DIETARY, DIETARY_VALUES, SKIP_OPTIONS, toggle, toggleExclusive } from "@/components/auth/foodOptions";
import { getMe, savePreferences, type DietaryNeed } from "@/lib/identity";

const CHIP_TAGS = new Set(CUISINES.flatMap((c) => c.tags));
const key = (s: ReadonlySet<string>) => [...s].sort().join(",");

function Chips({ label, options, selected, onToggle }: { label: string; options: { value: string; label: string }[]; selected: ReadonlySet<string>; onToggle: (v: string) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2 px-4 py-3.5">
      {options.map((o) => {
        const on = selected.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={`flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[15px] transition-colors active:opacity-70 ${
              on ? "bg-tint font-semibold text-tint-fg" : "bg-cell-2 text-label"
            }`}
          >
            {on && <CheckIcon size={13} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type Saved = { cuisines: string; dietary: string; skip: string };

export default function FoodPreferences() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [otherTastes, setOtherTastes] = useState<string[]>([]);
  const [cuisines, setCuisines] = useState<Set<string>>(new Set());
  const [dietary, setDietary] = useState<Set<string>>(new Set());
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    getMe()
      .then(({ preferences: p }) => {
        const tastes = new Set(p.tastes);
        const c = new Set(CUISINES.filter((x) => x.tags.length > 0 && x.tags.every((t) => tastes.has(t))).map((x) => x.value));
        const d = new Set<string>(p.dietary.filter((x) => DIETARY_VALUES.has(x as DietaryNeed)));
        const s = new Set(p.avoid.filter((a) => SKIP_OPTIONS.some((o) => o.value === a)));
        // Tastes learned elsewhere (not one of these chips) are kept as they are.
        setOtherTastes(p.tastes.filter((t) => !CHIP_TAGS.has(t)));
        setCuisines(c);
        setDietary(d.size ? d : new Set(["none"]));
        setSkip(s);
        setSaved({ cuisines: key(c), dietary: key(d.size ? d : new Set(["none"])), skip: key(s) });
        setLoaded(true);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  const dirty = useMemo(
    () => saved != null && (saved.cuisines !== key(cuisines) || saved.dietary !== key(dietary) || saved.skip !== key(skip)),
    [saved, cuisines, dietary, skip],
  );

  const edit = <T,>(fn: (v: T) => void) => (v: T) => {
    setJustSaved(false);
    fn(v);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const tags = CUISINES.filter((c) => cuisines.has(c.value)).flatMap((c) => c.tags);
      await savePreferences({
        tastes: [...new Set([...otherTastes, ...tags])],
        dietary: [...dietary].filter((d): d is DietaryNeed => d !== "none"),
        avoid: [...skip],
      });
      setSaved({ cuisines: key(cuisines), dietary: key(dietary), skip: key(skip) });
      setJustSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="mt-6 text-center text-[15px] text-label-2">{loadError}</p>;
  if (!loaded) return <p className="mt-6 text-center text-[15px] text-label-2">Loading…</p>;

  const veg = dietary.has("vegetarian") || dietary.has("vegan");
  return (
    <>
      <ListSection
        header="Dietary Needs"
        footer={
          veg
            ? "For vegetarian and vegan, we also show places that likely have options and say when to check the menu. Halal, kosher and allergies stay strict."
            : "We only suggest places that say they can serve these."
        }
      >
        <Chips label="Dietary needs" options={DIETARY} selected={dietary} onToggle={edit((v: string) => setDietary((s) => toggleExclusive(s, v, "none")))} />
      </ListSection>

      <ListSection header="Favorite Flavors" footer="A starting point. Your ratings and swipes teach us the rest.">
        <Chips label="Favorite flavors" options={CUISINES} selected={cuisines} onToggle={edit((v: string) => setCuisines((s) => toggleExclusive(s, v, "any")))} />
      </ListSection>

      <ListSection header="Rather Skip">
        <Chips label="Foods to skip" options={SKIP_OPTIONS} selected={skip} onToggle={edit((v: string) => setSkip((s) => toggle(s, v)))} />
      </ListSection>

      {error && <p className="mt-3 rounded-[14px] bg-cell px-4 py-3 text-[14px] text-danger">{error}</p>}
      <div className="mt-6">
        <Button onClick={save} disabled={!dirty || busy}>
          {busy ? "Saving…" : justSaved && !dirty ? "Saved" : "Save Changes"}
        </Button>
      </div>
    </>
  );
}
