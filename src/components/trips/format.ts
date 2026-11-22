// Owner: P4 - Game Layer & Map (see TEAM.md)
import type { TripView } from "@/features/trips/service";

export const miles = (m: number) => `${(m / 1609.34).toFixed(m < 1609 ? 2 : 1)} mi`;

export function duration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 1) return "<1 min";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** "Bus 1 → Red Line" or "Walked". */
export function howText(t: Pick<TripView, "rides" | "transitM">): string {
  const names = [...new Set(t.rides.map((r) => r.routeName ?? (r.mode === "t" ? "the T" : "a bus")))];
  if (names.length) return names.join(" → ");
  return t.transitM > 0 ? "Bus/T + walking" : "Walked";
}

export function statusText(t: Pick<TripView, "status" | "arrived">): string {
  if (t.status === "recording") return "On the way";
  return t.arrived ? "Arrived" : "Finished";
}

/** A group's Boston date ("2026-11-21") as "Sat, Nov 21". */
export const dayText = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export const whenText = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
