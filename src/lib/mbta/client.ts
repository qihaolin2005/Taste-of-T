// Owner: P2 - Data & Integrations (see TEAM.md)
// MBTA V3 fetch wrapper (api key header, timeouts, errors). Works in Node scripts and on the server.
// Without MBTA_API_KEY the API allows 20 requests/minute; with a free key, 1000/minute.

const BASE = "https://api-v3.mbta.com";

/** JSON:API resource as returned by MBTA V3. */
export type MbtaResource<A> = {
  id: string;
  type: string;
  attributes: A;
  relationships?: Record<string, { data: { id: string; type: string } | null } | undefined>;
};

export class MbtaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Unix seconds when the rate limit resets (on 429). */
    readonly resetAt?: number,
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | undefined>;

export async function mbtaGet<A>(path: string, params: Params = {}, { timeoutMs = 5000 } = {}): Promise<MbtaResource<A>[]> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));

  const headers: Record<string, string> = { accept: "application/vnd.api+json" };
  if (process.env.MBTA_API_KEY) headers["x-api-key"] = process.env.MBTA_API_KEY;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (err) {
    throw new MbtaError(`MBTA request failed: ${(err as Error).message}`);
  }
  if (res.status === 429) {
    throw new MbtaError("MBTA rate limit hit", 429, Number(res.headers.get("x-ratelimit-reset")) || undefined);
  }
  if (!res.ok) throw new MbtaError(`MBTA ${res.status} for ${url.pathname}`, res.status);
  const body = (await res.json()) as { data: MbtaResource<A>[] };
  return body.data;
}
