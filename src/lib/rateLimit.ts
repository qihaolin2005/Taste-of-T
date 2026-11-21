// Owner: P2 - Data & Integrations (see TEAM.md)
// Tiny in-memory fixed-window rate limiter (per server process). Enough to slow down
// password guessing at a hackathon; use a shared store (Redis/Turso) if deployed at scale.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Returns true if allowed. `limit` attempts per `windowMs` per key. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

/** True if `key` has already used up its limit in the current window (doesn't count an attempt). */
export function isRateLimited(key: string, limit: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  return !!b && now < b.resetAt && b.count >= limit;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
