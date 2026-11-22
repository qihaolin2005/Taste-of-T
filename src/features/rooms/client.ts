// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Browser helpers for the rooms API. Type-only imports, so no server code reaches the client.
import type { CreateRoomInput, MemberInput } from "./schemas";
import type { RoomView } from "./roomStore";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

const path = (code: string) => `/api/rooms/${encodeURIComponent(code)}`;

export const createRoom = (input: CreateRoomInput) => call<{ code: string }>("/api/rooms", { method: "POST", body: JSON.stringify(input) });
export const fetchRoom = (code: string) => call<RoomView>(path(code));
export const joinRoom = (code: string, input: MemberInput) => call<RoomView>(`${path(code)}/members`, { method: "POST", body: JSON.stringify(input) });
export const leaveRoom = (code: string) => call<void>(`${path(code)}/members`, { method: "DELETE" });
/** Host only: end the group for everyone. */
export const deleteRoom = (code: string) => call<void>(path(code), { method: "DELETE" });
/** The group you're in right now (member or host), or null. */
export const fetchCurrentRoom = () => call<{ code: string | null }>("/api/rooms").then((r) => r.code);
