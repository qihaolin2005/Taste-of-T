// Owner: P2 - Data & Integrations (see TEAM.md)
// Small in-memory TTL cache with request de-duplication.
// Memory only, never written to disk or the DB: Google's terms don't allow storing Places
// content (place ids excepted), so live data lives here briefly and is refetched after the TTL.

type Entry<T> = { value: T; at: number };

export class TtlCache<T> {
  private entries = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(
    private ttlMs: number,
    private maxEntries = 300,
  ) {}

  /** Fresh cached value, or undefined. */
  peek(key: string, now = Date.now()): T | undefined {
    const e = this.entries.get(key);
    return e && now - e.at < this.ttlMs ? e.value : undefined;
  }

  /** Cached value if fresh; otherwise run `load` once (concurrent callers share it). */
  get(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
    const hit = this.peek(key, now);
    if (hit !== undefined) return Promise.resolve(hit);
    let p = this.inflight.get(key);
    if (!p) {
      p = load()
        .then((value) => {
          this.entries.set(key, { value, at: Date.now() });
          if (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
          return value;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  clear() {
    this.entries.clear();
    this.inflight.clear();
  }
}
