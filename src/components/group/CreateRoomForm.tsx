// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Start an Adventure: name, when, and which stops. Creates the room and opens it to show the code.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, CheckIcon, ListRow, ListSection, SegmentedControl, SelectRow, TextFieldRow } from "@/components/shared/ios";
import { ApiError, createRoom, fetchCurrentRoom } from "@/features/rooms/client";
import type { StopCategory } from "@/features/rooms/schemas";
import { formatMinutes, halfHours } from "@/lib/time";

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
    <div>
      <ListSection header="The Adventure">
        <TextFieldRow label="Name" placeholder="Friday crew" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <SelectRow label="Starts" value={startTime} options={TIMES} onChange={setStartTime} />
      </ListSection>
      <div className="mt-3">
        <SegmentedControl
          options={[
            { value: "tonight", label: "Tonight" },
            { value: "tomorrow", label: "Tomorrow" },
          ]}
          value={day}
          onChange={setDay}
        />
      </div>

      <ListSection header="Stops" footer="Everyone gets at least one stop that matches their taste, and no one always gets the long ride.">
        {STOPS.map((s) => (
          <ListRow
            key={s.value}
            title={s.label}
            subtitle={s.detail}
            onClick={() => toggle(s.value)}
            accessory={<CheckIcon className={`shrink-0 text-tint ${slots.has(s.value) ? "opacity-100" : "opacity-0"}`} />}
          />
        ))}
      </ListSection>

      {error && (
        <p role="alert" className="mt-3 px-4 text-[15px] text-[#ff3b30]">
          {error}
        </p>
      )}
      <div className="mt-6">
        <Button onClick={submit} disabled={busy || slots.size === 0}>
          {busy ? "Creating…" : "Create Group & Get Code"}
        </Button>
      </div>
    </div>
  );
}
