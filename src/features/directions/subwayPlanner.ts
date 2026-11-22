// Owner: P4 - Game Layer & Map (see TEAM.md)
// Offline trip planner on the MBTA snapshot (data/stations.json): walk to a station, ride the
// subway (changing lines if that's faster), walk to the place. Subway and light rail only, no
// buses and no live schedule, so times are estimates. Used when Google transit directions
// aren't configured or fail. Pure: no I/O, so it's tested directly.
import { distanceMeters, walkMinutes, type LatLng } from "@/lib/geo";
import type { LineRecord, StationRecord } from "@/lib/mbta/stations";
import { decodePolyline } from "@/lib/polyline";
import type { RideLeg, TripLeg, TripPath, TripPlan } from "./types";

export const PLANNER_CONFIG = {
  /** Furthest we'll suggest walking to or from a station. */
  maxWalkM: 2000,
  /** Average wait for the first train. */
  waitMin: 4,
  /** Changing lines (walk + wait). Green branches share platforms, so less. */
  transferMin: 5,
  sameLineTransferMin: 3,
  /** Minutes per km between stations, including acceleration; street-running Green is slower. */
  rideMinPerKm: { default: 1.8, Green: 2.8, Mattapan: 2.4 } as Record<string, number>,
  dwellMin: 0.5,
  /** Walk instead if walking is about as fast, or short anyway. */
  shortWalkMin: 12,
  walkBeatsRideByMin: 3,
};

/**
 * Lines whose stationIds list two branches back to back. Red is "Alewife ... Ashmont, North
 * Quincy ... Braintree": the Braintree branch really leaves the trunk at JFK/UMass.
 */
const BRANCH_JOINS: Record<string, { branchStart: string; joinsAt: string }> = {
  Red: { branchStart: "place-nqncy", joinsAt: "place-jfk" },
};

const family = (routeId: string) => (routeId.startsWith("Green") ? "Green" : routeId);
const LINE_LABELS: Record<string, { line: string; short: string }> = {
  Red: { line: "Red Line", short: "Red" },
  Orange: { line: "Orange Line", short: "Orange" },
  Blue: { line: "Blue Line", short: "Blue" },
  Mattapan: { line: "Mattapan Trolley", short: "M" },
};
function label(l: LineRecord): { line: string; short: string } {
  if (LINE_LABELS[l.id]) return LINE_LABELS[l.id];
  if (l.id.startsWith("Green-")) return { line: `Green Line ${l.id.slice(6)}`, short: l.id.slice(6) };
  return { line: l.name, short: l.id };
}

/** Each line as one or more ordered runs of stations (branches split out). */
export function lineBranches(line: LineRecord): string[][] {
  const join = BRANCH_JOINS[line.id];
  const ids = line.stationIds;
  const at = join ? ids.indexOf(join.branchStart) : -1;
  const j = join ? ids.indexOf(join.joinsAt) : -1;
  if (at <= 0 || j < 0 || j >= at) return [ids];
  return [ids.slice(0, at), [...ids.slice(0, j + 1), ...ids.slice(at)]];
}

type NetLine = LineRecord & { branches: string[][]; shapesDecoded: LatLng[][] };

export type Network = {
  stations: Map<string, StationRecord>;
  lines: Map<string, NetLine>;
  /** `${station}|${route}` -> neighbors on that route. */
  next: Map<string, string[]>;
};

export function buildNetwork(stations: readonly StationRecord[], lines: readonly LineRecord[]): Network {
  const net: Network = { stations: new Map(stations.map((s) => [s.id, s])), lines: new Map(), next: new Map() };
  for (const l of lines) {
    const branches = lineBranches(l);
    net.lines.set(l.id, { ...l, branches, shapesDecoded: l.shapes.map(decodePolyline) });
    for (const run of branches) {
      for (let i = 0; i + 1 < run.length; i++) {
        for (const [a, b] of [[run[i], run[i + 1]], [run[i + 1], run[i]]]) {
          const k = `${a}|${l.id}`;
          const list = net.next.get(k) ?? [];
          if (!list.includes(b)) list.push(b);
          net.next.set(k, list);
        }
      }
    }
  }
  return net;
}

type State = { station: string; route: string };
const key = (s: State) => `${s.station}|${s.route}`;

function rideMinutes(a: LatLng, b: LatLng, route: string, cfg = PLANNER_CONFIG): number {
  const perKm = cfg.rideMinPerKm[family(route)] ?? cfg.rideMinPerKm.default;
  return (distanceMeters(a, b) / 1000) * perKm + cfg.dwellMin;
}

/** The ends of the branch(es) a ride from `fromId` to `toId` runs toward, e.g. "Ashmont/Braintree". */
function headsign(line: NetLine, fromId: string, toId: string, net: Network): string | undefined {
  const ends = new Set<string>();
  for (const run of line.branches) {
    const a = run.indexOf(fromId);
    const b = run.indexOf(toId);
    if (a < 0 || b < 0) continue;
    const end = b > a ? run[run.length - 1] : run[0];
    const name = net.stations.get(end)?.name;
    if (name) ends.add(name);
  }
  return ends.size ? [...ends].join("/") : undefined;
}

/** The line's drawn shape between two stations, or a straight line if it can't be matched. */
function shapeBetween(shapes: LatLng[][], a: LatLng, b: LatLng): LatLng[] {
  let best: { pts: LatLng[]; err: number } | null = null;
  for (const shape of shapes) {
    let ia = 0;
    let ib = 0;
    for (let i = 0; i < shape.length; i++) {
      if (distanceMeters(shape[i], a) < distanceMeters(shape[ia], a)) ia = i;
      if (distanceMeters(shape[i], b) < distanceMeters(shape[ib], b)) ib = i;
    }
    const err = distanceMeters(shape[ia], a) + distanceMeters(shape[ib], b);
    if (err > 400 || ia === ib) continue;
    const pts = ia < ib ? shape.slice(ia, ib + 1) : shape.slice(ib, ia + 1).reverse();
    if (!best || err < best.err) best = { pts, err };
  }
  return best?.pts ?? [a, b];
}

/**
 * Plans a subway trip, or returns null if there's no station within walking distance of either
 * end. If walking is about as fast (or short anyway), the plan is just the walk.
 */
export function planSubwayTrip(net: Network, from: LatLng, to: LatLng & { name?: string }, cfg = PLANNER_CONFIG): TripPlan | null {
  const placeName = to.name ?? "the restaurant";
  const directWalk = walkMinutes(from, to);
  const walkOnly = (): TripPlan => ({
    source: "offline",
    minutes: directWalk,
    legs: [{ kind: "walk", minutes: directWalk, meters: Math.round(distanceMeters(from, to)), to: placeName }],
    path: [{ color: "#8e8e93", walk: true, points: [from, to] }],
  });
  if (directWalk <= cfg.shortWalkMin) return walkOnly();

  const near = (p: LatLng) => [...net.stations.values()].filter((s) => distanceMeters(p, s) <= cfg.maxWalkM);
  const starts = near(from);
  const ends = new Map(near(to).map((s) => [s.id, walkMinutes(s, to)]));
  if (!starts.length || !ends.size) return directWalk <= 45 ? walkOnly() : null;

  // Dijkstra over (station, route). Small graph (~125 stations), so a plain array queue is fine.
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const queue: { k: string; s: State; d: number }[] = [];
  const push = (s: State, d: number, from: string | null) => {
    const k = key(s);
    if (d >= (dist.get(k) ?? Infinity)) return;
    dist.set(k, d);
    prev.set(k, from);
    queue.push({ k, s, d });
  };
  for (const s of starts) for (const r of s.lines) if (net.lines.has(r)) push({ station: s.id, route: r }, walkMinutes(from, s) + cfg.waitMin, null);

  while (queue.length) {
    queue.sort((x, y) => x.d - y.d);
    const { k, s, d } = queue.shift()!;
    if (d > (dist.get(k) ?? Infinity)) continue;
    const here = net.stations.get(s.station)!;
    for (const n of net.next.get(k) ?? []) push({ station: n, route: s.route }, d + rideMinutes(here, net.stations.get(n)!, s.route, cfg), k);
    for (const r of here.lines) {
      if (r === s.route || !net.lines.has(r)) continue;
      push({ station: s.station, route: r }, d + (family(r) === family(s.route) ? cfg.sameLineTransferMin : cfg.transferMin), k);
    }
  }

  let best: { k: string; total: number } | null = null;
  for (const [k, d] of dist) {
    const walk = ends.get(k.split("|")[0]);
    if (walk == null) continue;
    const total = d + walk;
    if (!best || total < best.total) best = { k, total };
  }
  if (!best || directWalk <= best.total + cfg.walkBeatsRideByMin) return walkOnly();

  // Walk the chain back: states in order, then group runs on the same route into ride legs.
  const chain: State[] = [];
  for (let k: string | null = best.k; k; k = prev.get(k) ?? null) {
    const [station, route] = k.split("|");
    chain.unshift({ station, route });
  }
  const legs: TripLeg[] = [];
  const path: TripPath[] = [];
  const first = net.stations.get(chain[0].station)!;
  legs.push({ kind: "walk", minutes: walkMinutes(from, first), meters: Math.round(distanceMeters(from, first)), to: first.name });
  path.push({ color: "#8e8e93", walk: true, points: [from, first] });

  let i = 0;
  while (i < chain.length) {
    let j = i;
    while (j + 1 < chain.length && chain[j + 1].route === chain[i].route) j++;
    if (j > i) {
      const line = net.lines.get(chain[i].route)!;
      const a = net.stations.get(chain[i].station)!;
      const b = net.stations.get(chain[j].station)!;
      let minutes = 0;
      for (let x = i; x < j; x++) minutes += rideMinutes(net.stations.get(chain[x].station)!, net.stations.get(chain[x + 1].station)!, line.id, cfg);
      // On the shared Green trunk any branch works: say so instead of naming one.
      const sameStretch = [...net.lines.values()].filter((l) => family(l.id) === family(line.id) && l.branches.some((run) => run.includes(a.id) && run.includes(b.id)));
      const anyGreen = family(line.id) === "Green" && sameStretch.length > 1;
      const letters = sameStretch.map((l) => l.id.slice(6)).sort();
      const leg: RideLeg = {
        kind: "ride",
        mode: family(line.id) === "Green" || line.id === "Mattapan" ? "light_rail" : "subway",
        ...(anyGreen ? { line: `Green Line ${letters.join("/")}`, short: "Green" } : label(line)),
        color: line.color,
        from: { name: a.name, lat: a.lat, lng: a.lng },
        to: { name: b.name, lat: b.lat, lng: b.lng },
        stops: j - i,
        minutes: Math.max(1, Math.round(minutes)),
        headsign: anyGreen ? `any ${letters.join(", ")} train` : headsign(line, a.id, b.id, net),
      };
      legs.push(leg);
      path.push({ color: line.color, walk: false, points: shapeBetween(line.shapesDecoded, a, b) });
    }
    i = j + 1;
  }

  const last = net.stations.get(chain[chain.length - 1].station)!;
  legs.push({ kind: "walk", minutes: walkMinutes(last, to), meters: Math.round(distanceMeters(last, to)), to: placeName });
  path.push({ color: "#8e8e93", walk: true, points: [last, to] });
  return { source: "offline", minutes: Math.round(best.total), legs, path };
}
