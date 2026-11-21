// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Your info for one night (the Figma Night Out planner fields): name, where you start, where
// you go home, budget, leaving early. Prefilled from your profile (or your existing
// membership). Dietary needs and tastes come from your profile automatically.
"use client";

import { useEffect, useState } from "react";
import type { StationOption } from "@/components/shared/StationPicker";
import type { MemberInput } from "@/features/rooms/schemas";
import type { YourMembership } from "@/features/rooms/roomStore";
import { getMe } from "@/lib/identity";
import { formatMinutes, halfHours } from "@/lib/time";
import { Chip, Field, inputCls, StationSearch } from "./squadUi";

const BUDGETS = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150];
const LEAVE_OPTIONS = [{ value: 0, label: "No, I’m out all night" }, ...halfHours(20 * 60, 25 * 60).map((m) => ({ value: m, label: `By ${formatMinutes(m)}` }))];
const DIET_LABELS: Record<string, string> = { "gluten-free": "Gluten-free", "dairy-free": "Dairy-free", "nut-free": "Nut allergy" };
const dietLabel = (d: string) => DIET_LABELS[d] ?? d[0].toUpperCase() + d.slice(1);

type Props = {
  stations: readonly StationOption[];
  existing: YourMembership | null;
  submitLabel: string;
  onSubmit: (input: MemberInput) => Promise<void>;
  onCancel?: () => void;
};

export default function MemberForm({ stations, existing, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [start, setStart] = useState(existing?.startStationId ?? "");
  const [home, setHome] = useState(existing?.homeStationId ?? "");
  const [budget, setBudget] = useState(existing?.budget ?? 30);
  const [leaveBy, setLeaveBy] = useState(existing?.leaveBy ?? 0);
  const [dietary, setDietary] = useState<string[]>(existing?.dietary ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New member: prefill from profile preferences.
  useEffect(() => {
    if (existing) return;
    getMe()
      .then(({ user, preferences: p }) => {
        setName((n) => n || (user.displayName === "T Explorer" ? "" : user.displayName));
        setHome((h) => h || p.homeStationId || "");
        setStart((s) => s || p.usualStartStationId || p.homeStationId || "");
        if (p.defaultBudget) setBudget(p.defaultBudget);
        setDietary(p.dietary);
      })
      .catch(() => {});
  }, [existing]);

  const missing = !name.trim() ? "your name" : !start ? "where you're starting" : !home ? "where you're going home" : null;
  const budgets = BUDGETS.includes(budget) ? BUDGETS : [...BUDGETS, budget].sort((a, b) => a - b);

  async function submit() {
    if (missing) return setError(`Add ${missing}.`);
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), startStationId: start, homeStationId: home, budget, leaveBy: leaveBy || null });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tot-squad-in mt-5 rounded-[22px] border border-separator bg-cell p-[18px]">
      <h2 className="mb-1 text-[18px] font-bold text-label">{existing ? "Your info for tonight" : "Join this squad"}</h2>
      <p className="mb-4 text-[13px] leading-[1.45] text-label-2">The plan uses everyone’s start, budget, and way home so the night works for the whole group.</p>

      <Field label="Your name">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" placeholder="What friends call you" aria-label="Your name" className={inputCls} />
      </Field>
      <Field label="Starting from">
        <StationSearch label="Starting from" stations={stations} value={start} onChange={setStart} />
      </Field>
      <Field label="Going home to">
        <StationSearch label="Going home to" stations={stations} value={home} onChange={setHome} />
      </Field>
      <Field label="Budget per person">
        <div className="flex flex-wrap gap-[7px]">
          {budgets.map((b) => (
            <Chip key={b} on={budget === b} onClick={() => setBudget(b)}>
              ${b}
            </Chip>
          ))}
        </div>
      </Field>
      <Field
        label="Leaving early?"
        hint={
          <>
            Your budget and home station are only used for planning; other members can’t see them.
            {dietary.length > 0 && <> Dietary needs from your profile: {dietary.map(dietLabel).join(", ")}.</>}
          </>
        }
      >
        <select aria-label="Leaving early" value={leaveBy} onChange={(e) => setLeaveBy(Number(e.target.value))} className={`${inputCls} appearance-none`}>
          {LEAVE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {error && (
        <p role="alert" className="mb-3 rounded-[14px] bg-[#fbeff4] px-4 py-3 text-[14px] leading-5 text-[#8c456c]">
          {error}
        </p>
      )}
      <div className="grid gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex min-h-[54px] w-full items-center justify-center rounded-[17px] bg-tint text-[16px] font-bold text-tint-fg shadow-[0_9px_20px_rgb(121_84_172/0.18)] transition active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-11 text-[14px] font-medium text-label-2 active:opacity-60">
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
