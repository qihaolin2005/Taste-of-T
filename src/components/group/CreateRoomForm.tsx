// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// "Create a Squad" (Figma setup form): name, when, start time, and which stops. Creates the
// group (POST /api/rooms) and opens it, where the code and invite are shown.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon } from "@/components/shared/ios";
import { createRoom } from "@/features/rooms/client";
import type { StopCategory } from "@/features/rooms/schemas";
import { formatMinutes, halfHours } from "@/lib/time";
import { Chip, Field, inputCls } from "./squadUi";

const STOPS: { value: StopCategory; label: string; detail: string }[] = [
  { value: "dinner", label: "Dinner", detail: "Somewhere to eat" },
  { value: "dessert", label: "Dessert or boba", detail: "Something sweet after" },
  { value: "activity", label: "Activity", detail: "Karaoke, bowling, a walk…" },
];

const TIMES = halfHours(11 * 60, 22 * 60).map((m) => ({ value: m, label: formatMinutes(m) }));

export default function CreateRoomForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [day, setDay] = useState<"tonight" | "tomorrow">("tonight");
  const [startTime, setStartTime] = useState(19 * 60);
  const [slots, setSlots] = useState<Set<StopCategory>>(new Set(["dinner", "dessert", "activity"]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(s: StopCategory) {
    setSlots((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { code } = await createRoom({ name: name.trim() || "Night out", day, startTime, slots: [...slots] });
      router.push(`/room/${code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      className="tot-squad-in"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && slots.size > 0) submit();
      }}
    >
      <Field label="Squad name">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Friday crew" aria-label="Squad name" className={inputCls} />
      </Field>

      <Field label="When">
        <div className="flex gap-[7px]">
          <Chip on={day === "tonight"} onClick={() => setDay("tonight")}>
            Tonight
          </Chip>
          <Chip on={day === "tomorrow"} onClick={() => setDay("tomorrow")}>
            Tomorrow
          </Chip>
        </div>
      </Field>

      <Field label="Starts at">
        <select aria-label="Start time" value={startTime} onChange={(e) => setStartTime(Number(e.target.value))} className={`${inputCls} appearance-none`}>
          {TIMES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Stops" hint="Everyone gets at least one stop that matches their taste, and no one always gets the long ride.">
        <div className="grid gap-2">
          {STOPS.map((s) => {
            const on = slots.has(s.value);
            return (
              <button
                key={s.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(s.value)}
                className={`flex min-h-[58px] items-center justify-between rounded-[15px] border px-[14px] text-left transition-colors ${on ? "border-[#b69fe3] bg-lavender" : "border-separator bg-cell"}`}
              >
                <span className="grid gap-0.5">
                  <b className="text-[15px] text-label">{s.label}</b>
                  <small className="text-[13px] text-label-2">{s.detail}</small>
                </span>
                <span className={`grid size-6 place-items-center rounded-full ${on ? "bg-tint text-tint-fg" : "border border-label-3"}`}>{on && <CheckIcon size={14} />}</span>
              </button>
            );
          })}
        </div>
      </Field>

      {error && (
        <p role="alert" className="mb-3 rounded-[14px] bg-[#fbeff4] px-4 py-3 text-[14px] leading-5 text-[#8c456c]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || slots.size === 0}
        className="mt-1 flex min-h-[54px] w-full items-center justify-center rounded-[17px] bg-tint text-[16px] font-bold text-tint-fg shadow-[0_9px_20px_rgb(121_84_172/0.18)] transition active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "Creating…" : slots.size === 0 ? "Pick at least one stop" : "Create Squad"}
      </button>
    </form>
  );
}
