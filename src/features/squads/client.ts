// Owner: P1 - Planner & Quests (ML) (see TEAM.md)
// Browser helpers for the squad session routes. Type-only imports, so no server code reaches the client.
import type { LiveState, SwipeResult } from "./service";
import type { SessionDeck, SquadPlan } from "@/features/ml";

export class SquadApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new SquadApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

const base = (code: string) => `/api/rooms/${encodeURIComponent(code)}`;

export type { LiveState };
export const fetchSession = (code: string) => call<LiveState>(`${base(code)}/session`);
export const startSession = (code: string) => call<{ deck: SessionDeck }>(`${base(code)}/start`, { method: "POST" });
export const sendSwipe = (code: string, placeId: string, liked: boolean) =>
  call<SwipeResult>(`${base(code)}/swipes`, { method: "POST", body: JSON.stringify({ placeId, liked }) });
export const endSession = (code: string) => call<{ plan: SquadPlan }>(`${base(code)}/end`, { method: "POST" });
