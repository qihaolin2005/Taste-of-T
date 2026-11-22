// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// "Going home to" as a search box (Google Maps / Uber style): type an address, neighborhood,
// landmark or T station, pick a suggestion. GET /api/places/autocomplete (debounced, one Google
// session per search) and, for an address, GET /api/places/resolve to find its nearest station.
// The group stores a home *station* (homeStationId): it's what the planner routes to and checks
// the last train for. The address you typed is only shown here, never saved.
// Keyboard: ↑/↓ to move, Enter to pick, Escape to close. Put inside <ListSection>.
"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { StationOption } from "@/components/shared/StationPicker";

type Suggestion = { kind: "station"; stationId: string; title: string; subtitle: string } | { kind: "place"; placeId: string; title: string; subtitle: string };

const DEBOUNCE_MS = 300;
const newSession = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2)}`);

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

function TrainGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="3.5" width="12" height="13" rx="3" />
      <path d="M6 10.5h12M9.5 13.5h.01M14.5 13.5h.01M9 20l1.5-3.5M15 20l-1.5-3.5" />
    </svg>
  );
}

export default function HomeLocationSearch({ label, stations, value, onChange }: { label: string; stations: readonly StationOption[]; value: string; onChange: (stationId: string) => void }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const session = useRef(newSession());
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [searched, setSearched] = useState(""); // the query the current items are for
  const [active, setActive] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What you picked, as you'd say it ("123 Elm St"), plus the station it maps to.
  const [picked, setPicked] = useState<{ label: string; note: string } | null>(null);

  const stationName = stations.find((s) => s.id === value)?.name ?? null;
  const open = editing && query.trim().length >= 2;
  const loading = open && searched !== query.trim();

  // Debounced search: only the last keystroke in DEBOUNCE_MS asks the server.
  useEffect(() => {
    const q = query.trim();
    if (!editing || q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/places/autocomplete?${new URLSearchParams({ q, session: session.current })}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((b: { suggestions?: Suggestion[] }) => {
          setItems(b.suggestions ?? []);
          setActive(0);
          setSearched(q);
        })
        .catch((err: Error) => {
          if (err.name === "AbortError") return;
          setItems([]);
          setSearched(q);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, editing]);

  function startEditing() {
    setEditing(true);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function close() {
    setEditing(false);
    setQuery("");
    setItems([]);
    setSearched("");
  }

  async function choose(s: Suggestion) {
    setError(null);
    if (s.kind === "station") {
      onChange(s.stationId);
      setPicked({ label: s.title, note: "T station" });
      close();
      return;
    }
    setResolving(true);
    try {
      const r = await fetch(`/api/places/resolve?${new URLSearchParams({ placeId: s.placeId, session: session.current })}`);
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(b?.error?.message ?? "Couldn't look that place up.");
      const home = b.home as { stationId: string; stationName: string; walkMinutes: number };
      onChange(home.stationId);
      setPicked({ label: s.title, note: `Nearest T: ${home.stationName} · ${home.walkMinutes} min walk` });
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      session.current = newSession(); // a search ends with a pick (Google session pricing)
      setResolving(false);
    }
  }

  function clear() {
    onChange("");
    setPicked(null);
    setQuery("");
    startEditing();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (value) close();
      else setQuery("");
      return;
    }
    if (!open || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!resolving) choose(items[active]);
    }
  }

  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;

  // Picked and not editing: show the choice, with Change / Clear.
  if (!editing && value) {
    return (
      <div className="ios-row">
        <div className="ios-row-body ml-4 flex min-h-[60px] items-center gap-3 py-2 pr-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-lavender text-plum">
            <PinIcon />
          </span>
          <button type="button" onClick={startEditing} className="min-w-0 flex-1 text-left" aria-label={`${label}: ${picked?.label ?? stationName}. Change`}>
            <span className="block text-[13px] text-label-2">{label}</span>
            <span className="block truncate text-[17px] text-label">{picked?.label ?? stationName ?? "Your stop"}</span>
            <span className="block truncate text-[13px] text-label-2">{picked?.note ?? "T station"}</span>
          </button>
          <button type="button" onClick={clear} className="min-h-11 shrink-0 rounded-full px-3 text-[15px] font-semibold text-tint active:bg-cell-2">
            Clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ios-row">
      <div className="ios-row-body ml-4 py-2.5 pr-4">
        <label htmlFor={`${id}-input`} className="block pb-1.5 text-[13px] text-label-2">
          {label}
        </label>
        <div className="flex min-h-12 items-center gap-2 rounded-[14px] border border-separator bg-grouped px-3 focus-within:border-tint">
          <span className="text-tint">
            <PinIcon />
          </span>
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && items.length ? optionId(active) : undefined}
            placeholder="Search address or T station"
            value={query}
            onFocus={() => setEditing(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setEditing(true);
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[17px] text-label outline-none placeholder:text-label-3"
          />
          {(query || value) && (
            <button
              type="button"
              aria-label={value && !query ? "Keep current choice" : "Clear search"}
              onClick={() => (query ? setQuery("") : close())}
              className="grid size-8 shrink-0 place-items-center rounded-full text-label-3 active:bg-cell-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>

        {open && (
          <div className="mt-2 overflow-hidden rounded-[16px] border border-separator bg-cell shadow-[var(--card-shadow)]">
            {loading && !items.length ? (
              <p className="px-4 py-3.5 text-[14px] text-label-2" role="status">
                Searching…
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-3.5 text-[14px] text-label-2" role="status">
                No places match “{query.trim()}”. Try a street address, a neighborhood, or a T station name.
              </p>
            ) : (
              <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className={loading ? "opacity-60" : undefined}>
                {items.map((s, i) => (
                  <li
                    key={s.kind === "station" ? `st-${s.stationId}` : `pl-${s.placeId}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    onPointerEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                    onClick={() => !resolving && choose(s)}
                    className={`flex min-h-[56px] cursor-pointer items-center gap-3 border-b border-separator px-3 last:border-b-0 ${i === active ? "bg-lavender" : ""}`}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-lavender text-plum">{s.kind === "station" ? <TrainGlyph /> : <PinIcon />}</span>
                    <span className="min-w-0 flex-1 py-2">
                      <span className="block truncate text-[16px] font-semibold text-label">{s.title}</span>
                      {s.subtitle && <span className="block truncate text-[13px] text-label-2">{s.subtitle}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {resolving && (
          <p className="mt-2 text-[13px] text-label-2" role="status">
            Finding the nearest T station…
          </p>
        )}
        {error && (
          <p className="mt-2 text-[13px] text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
