// Owner: P1 - Planner & Quests (see TEAM.md)
// Minutes-after-midnight helpers (may exceed 1440 for past midnight). America/New_York.
// TODO(P1): add planner helpers (addMinutes, isOpenAt, ...) here.

/** 1140 -> "7:00 PM", 1500 -> "1:00 AM" (past midnight wraps). */
export function formatMinutes(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** Half-hour options between two times, e.g. halfHours(17 * 60, 22 * 60). */
export function halfHours(from: number, to: number): number[] {
  const out: number[] = [];
  for (let m = from; m <= to; m += 30) out.push(m);
  return out;
}
