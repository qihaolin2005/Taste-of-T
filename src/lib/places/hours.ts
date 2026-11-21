// Owner: P2 - Data & Integrations (see TEAM.md)
// Opening hours: convert Google's format, and answer "is it open at this time?".
import type { OpenInterval, WeeklyHours } from "./types";

type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type GooglePoint = { day: number; hour: number; minute?: number };
export type GooglePeriod = { open: GooglePoint; close?: GooglePoint };

/**
 * Google periods -> WeeklyHours. A period that closes on a later day (e.g. opens Fri 18:00,
 * closes Sat 02:00) becomes Fri { open: 1080, close: 1560 }, so "past midnight" stays attached
 * to the night it belongs to. A single period with no close means open 24/7.
 */
export function fromGooglePeriods(periods: readonly GooglePeriod[] | undefined): WeeklyHours | undefined {
  if (!periods?.length) return undefined;
  if (periods.length === 1 && !periods[0].close) {
    return Object.fromEntries(([0, 1, 2, 3, 4, 5, 6] as Day[]).map((d) => [d, [{ open: 0, close: 1440 }]]));
  }
  const hours: WeeklyHours = {};
  for (const p of periods) {
    if (!p.close) continue;
    const day = p.open.day as Day;
    const open = p.open.hour * 60 + (p.open.minute ?? 0);
    const daysLater = (p.close.day - p.open.day + 7) % 7;
    let close = daysLater * 1440 + p.close.hour * 60 + (p.close.minute ?? 0);
    if (close <= open) close += 7 * 1440; // closes a week later = effectively always open
    (hours[day] ??= []).push({ open, close: Math.min(close, open + 1440) });
  }
  for (const list of Object.values(hours)) list?.sort((a, b) => a.open - b.open);
  return hours;
}

/**
 * Is the place open for the whole visit [minute, minute + stayMinutes) on `day`?
 * `minute` may be past 1440 (e.g. 1:00 AM on Friday night = Friday, 1500).
 * Unknown hours count as open: we'd rather suggest it than hide it.
 */
export function isOpenFor(hours: WeeklyHours | undefined, day: number, minute: number, stayMinutes = 0): boolean {
  if (!hours) return true;
  const end = minute + stayMinutes;
  const fits = (list: readonly OpenInterval[] | undefined, offset: number) =>
    (list ?? []).some((iv) => iv.open + offset <= minute && end <= iv.close + offset);
  const today = hours[(((day % 7) + 7) % 7) as Day];
  const yesterday = hours[((((day - 1) % 7) + 7) % 7) as Day];
  // Also check last night's hours that run past midnight into today (shifted back a day).
  return fits(today, 0) || fits(yesterday, -1440);
}

/** True if it's open past 11:30 PM on any night: tagged "late-night". */
export function isLateNight(hours: WeeklyHours | undefined): boolean {
  return Object.values(hours ?? {}).some((list) => list?.some((iv) => iv.close >= 23 * 60 + 30));
}
