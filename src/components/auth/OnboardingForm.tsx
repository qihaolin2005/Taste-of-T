// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// First-run setup for a new account: dietary restrictions (required question, "none" is fine)
// and optional foods to skip. Answers become hard constraints for the planner and ML model.
"use client";

import { useEffect, useState } from "react";
import { Button, CheckIcon, ListRow, ListSection, TextFieldRow } from "@/components/shared/ios";
import { completeOnboarding, getMe, type DietaryNeed } from "@/lib/identity";

/** Default name from the schema: means they haven't told us their name yet. */
const DEFAULT_NAME = "T Explorer";

const DIETARY: { value: DietaryNeed; label: string; detail?: string }[] = [
  { value: "vegetarian", label: "Vegetarian", detail: "No meat or fish" },
  { value: "vegan", label: "Vegan", detail: "No animal products" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
  { value: "gluten-free", label: "Gluten-free", detail: "Celiac or gluten intolerance" },
  { value: "dairy-free", label: "Dairy-free", detail: "Lactose intolerant or dairy allergy" },
  { value: "nut-free", label: "Nut allergy", detail: "Peanuts or tree nuts" },
];

const SKIP_OPTIONS = ["seafood", "shellfish", "pork", "beef", "spicy", "sushi"];

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

export default function OnboardingForm() {
  const [dietary, setDietary] = useState<Set<DietaryNeed>>(new Set());
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [askName, setAskName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only ask for a name if we don't have one (guests, or sign-ups that skipped it).
  useEffect(() => {
    getMe()
      .then(({ user }) => setAskName(user.displayName === DEFAULT_NAME))
      .catch(() => setAskName(false));
  }, []);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding({ dietary: [...dietary], avoid: [...skip], ...(name.trim() ? { displayName: name.trim() } : {}) });
      window.location.replace("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="-mt-1 text-[15px] leading-5 text-label-2">We&apos;ll only plan stops that work for you. You can change this later.</p>

      {askName && (
        <ListSection header="Your Name">
          <TextFieldRow label="Name" placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} />
        </ListSection>
      )}

      <ListSection header="Dietary Restrictions" footer="We'll never suggest a place that can't serve these.">
        {DIETARY.map((d) => {
          const on = dietary.has(d.value);
          return (
            <ListRow
              key={d.value}
              title={d.label}
              subtitle={d.detail}
              onClick={() => setDietary((s) => toggle(s, d.value))}
              accessory={<CheckIcon className={`shrink-0 text-tint transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />}
            />
          );
        })}
      </ListSection>

      <section className="mt-6">
        <h2 className="px-4 pb-1.5 text-[13px] uppercase text-label-2">Rather Skip (Optional)</h2>
        <div className="flex flex-wrap gap-2 px-1">
          {SKIP_OPTIONS.map((s) => {
            const on = skip.has(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setSkip((x) => toggle(x, s))}
                className={`rounded-full px-4 py-2 text-[15px] font-medium capitalize transition-colors ${on ? "bg-tint text-tint-fg" : "bg-cell text-label"}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-4 px-4 text-[15px] text-[#ff3b30]">
          {error}
        </p>
      )}

      <div className="mt-8">
        <Button onClick={finish} disabled={busy}>
          {busy ? "Saving…" : dietary.size === 0 ? "No Restrictions, Continue" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
