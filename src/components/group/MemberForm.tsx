// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Your info for one night: name, where you start, where you go home, budget, leaving early.
// Prefilled from your profile (or your existing membership). Dietary needs and tastes come
// from your profile automatically.
"use client";

import { useEffect, useState } from "react";
import { Button, ListSection, SelectRow, TextFieldRow } from "@/components/shared/ios";
import StationPicker, { type StationOption } from "@/components/shared/StationPicker";
import type { MemberInput } from "@/features/rooms/schemas";
import type { YourMembership } from "@/features/rooms/roomStore";
import { getMe } from "@/lib/identity";
import { formatMinutes, halfHours } from "@/lib/time";

const BUDGETS = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150].map((b) => ({ value: b, label: `$${b}` }));
const LEAVE_OPTIONS = [{ value: 0, label: "No" }, ...halfHours(20 * 60, 25 * 60).map((m) => ({ value: m, label: `By ${formatMinutes(m)}` }))];
const DIET_LABELS: Record<string, string> = { "gluten-free": "Gluten-free", "dairy-free": "Dairy-free", "nut-free": "Nut allergy" };
const dietLabel = (d: string) => DIET_LABELS[d] ?? d[0].toUpperCase() + d.slice(1);

type Props = {
  stations: readonly StationOption[];
  existing: YourMembership | null;
  submitLabel: string;
  onSubmit: (input: MemberInput) => Promise<void>;
};

export default function MemberForm({ stations, existing, submitLabel, onSubmit }: Props) {
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
    <div>
      <ListSection header="You">
        <TextFieldRow label="Name" placeholder="What friends call you" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" />
        <StationPicker label="Starting from" stations={stations} value={start} onChange={setStart} />
        <StationPicker label="Going home to" stations={stations} value={home} onChange={setHome} />
        <SelectRow label="Budget" value={budget} options={BUDGETS} onChange={setBudget} />
      </ListSection>

      <ListSection
        header="Optional"
        footer={
          <>
            Your budget and home station are only used for planning; other members can&apos;t see them.
            {dietary.length > 0 && <> Dietary needs from your profile: {dietary.map(dietLabel).join(", ")}.</>}
          </>
        }
      >
        <SelectRow label="Leaving early" value={leaveBy} options={LEAVE_OPTIONS} onChange={setLeaveBy} />
      </ListSection>

      {error && (
        <p role="alert" className="mt-3 px-4 text-[15px] text-[#ff3b30]">
          {error}
        </p>
      )}
      <div className="mt-6">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
