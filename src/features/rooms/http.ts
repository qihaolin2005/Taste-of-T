// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Shared Route Handler bits for /api/rooms/*.
import { apiError } from "@/lib/api";
import { isRateLimited, rateLimit } from "@/lib/rateLimit";
import { RoomFullError, RoomNotFoundError } from "./roomStore";

// Wrong codes are counted per IP, so nobody can sweep through codes to find strangers' rooms,
// while members polling a real code are never throttled. 30 misses per 15 minutes.
const MISS_LIMIT = 30;
const MISS_WINDOW_MS = 15 * 60_000;
const missKey = (ip: string) => `room-miss:${ip}`;

export function tooManyMisses(ip: string): Response | null {
  return isRateLimited(missKey(ip), MISS_LIMIT) ? apiError("too_many_requests", "Too many wrong codes. Try again in a few minutes.") : null;
}

/** Map room errors to HTTP responses; rethrow anything unexpected. */
export function roomErrorResponse(err: unknown, ip: string): Response {
  if (err instanceof RoomNotFoundError) {
    rateLimit(missKey(ip), MISS_LIMIT, MISS_WINDOW_MS);
    return apiError("not_found", err.message);
  }
  if (err instanceof RoomFullError) return apiError("conflict", err.message);
  throw err;
}
