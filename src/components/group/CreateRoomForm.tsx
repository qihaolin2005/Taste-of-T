// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Create an Adventure: name, when, and which stops, all in one card that ends with the
// Create button. Stops can't be changed once the group exists (POST /api/rooms takes them), so
// they stay before the button. Creates the room and opens it to show the code.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, CheckIcon, ListRow, SegmentedControl, SelectRow, TextFieldRow } from "@/components/shared/ios";
import { ApiError, createRoom, fetchCurrentRoom } from "@/features/rooms/client";
import type { NEW_STOP_CATEGORIES } from "@/features/rooms/schemas";
import { formatMinutes, halfHours } from "@/lib/time";

type NewStop = (typeof NEW_STOP_CATEGORIES)[number];

// A food night, in order: Dinner -> Dessert or boba -> Late-Night Bites.
const STOPS: { value: NewStop; label: string; detail: string }[] = [
  { value: "dinner", label: "Dinner", detail: "Somewhere to eat" },
  { value: "dessert", label: "Dessert or boba", detail: "Something sweet after" },
  { value: "late-night", label: "Late-Night Bites", detail: "One more bite before the last train" },
];

const TIMES = halfHours(11 * 60, 22 * 60).map((m) => ({ value: m, label: formatMinutes(m) }));

export default function CreateRoomForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [day, setDay] = useState<"tonight" | "tomorrow">("tonight");
  const [startTime, setStartTime] = useState(19 * 60);
  const [slots, setSlots] = useState<Set<NewStop>>(new Set(["dinner", "dessert", "late-night"]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(s: NewStop) {
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
      const { code } = await createRoom({ name: name.trim() || "Adventure", day, startTime, slots: [...slots] });
      // replace, not push: "back" from the group shouldn't land on this page, which would just send
      // you back to the group (CurrentGroupGate).
      router.replace(`/room/${code}`);
    } catch (err) {
      // Already in a group (say, from another tab): go back to it instead.
      const current = err instanceof ApiError && err.status === 409 ? await fetchCurrentRoom().catch(() => null) : null;
      if (current) return router.replace(`/room/${current}`);
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="mt-6" aria-labelledby="create-adventure">
      <h2 id="create-adventure" className="px-1 text-[18px] font-bold leading-6 tracking-[-0.02em] text-label">
        Create an Adventure
      </h2>
      <p className="mb-2.5 px-1 text-[13px] text-label-2">Start a group and get a code to share.</p>

      <div className="overflow-hidden rounded-[22px] border border-separator bg-cell shadow-[var(--card-shadow)]">
        <TextFieldRow label="Name" placeholder="Friday crew" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <SelectRow label="Starts" value={startTime} options={TIMES} onChange={setStartTime} />
        <div className="px-4 py-3">
          <SegmentedControl
            options={[
              { value: "tonight", label: "Tonight" },
              { value: "tomorrow", label: "Tomorrow" },
            ]}
            value={day}
            onChange={setDay}
          />
        </div>

        <p className="border-t border-separator px-4 pb-1 pt-3 text-[13px] font-semibold uppercase tracking-wide text-label-2">Stops</p>
        {STOPS.map((s) => (
          <ListRow
            key={s.value}
            title={s.label}
            subtitle={s.detail}
            onClick={() => toggle(s.value)}
            accessory={<CheckIcon className={`shrink-0 text-tint ${slots.has(s.value) ? "opacity-100" : "opacity-0"}`} />}
          />
        ))}

        <div className="border-t border-separator p-4">
          {error && (
            <p role="alert" className="mb-3 text-[15px] text-[#ff3b30]">
              {error}
            </p>
          )}
          <Button onClick={submit} disabled={busy || slots.size === 0}>
            {busy ? "Creating…" : "Create Adventure"}
          </Button>
          <p className="mt-2 text-center text-[13px] leading-[18px] text-label-2">
            {slots.size === 0 ? "Pick at least one stop." : "You\u2019ll get a 4-letter invite code to share with your crew."}
          </p>
        </div>
      </div>
    </section>
  );
}
