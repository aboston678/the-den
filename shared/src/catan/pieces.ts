// Costs, piece limits, where things may be built, harbor rates and victory points.

import { EDGES, HEX_VERTICES, VERTEX_EDGES, VERTEX_NEIGHBORS } from "./topology.ts";
import { RESOURCES, type CatanGame, type Hand, type Resource } from "./types.ts";

export const COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { ore: 3, grain: 2 },
  dev: { ore: 1, wool: 1, grain: 1 },
} as const satisfies Record<string, Partial<Hand>>;

export const PIECES = { road: 15, settlement: 5, city: 4 } as const;
export const WIN_VP = 10;
export const BANK_EACH = 19;

export function has(hand: Hand, cost: Partial<Hand>): boolean {
  return RESOURCES.every((r) => hand[r] >= (cost[r] ?? 0));
}

export function pay(from: Hand, to: Hand, cards: Partial<Hand>) {
  for (const r of RESOURCES) {
    from[r] -= cards[r] ?? 0;
    to[r] += cards[r] ?? 0;
  }
}

export const roadsBuilt = (g: CatanGame, p: number) => g.roads.filter((o) => o === p).length;
export const settlementsBuilt = (g: CatanGame, p: number) => g.buildings.filter((b) => b && b.owner === p && !b.city).length;
export const citiesBuilt = (g: CatanGame, p: number) => g.buildings.filter((b) => b && b.owner === p && b.city).length;

export const piecesLeft = (g: CatanGame, p: number) => ({
  road: PIECES.road - roadsBuilt(g, p),
  settlement: PIECES.settlement - settlementsBuilt(g, p),
  city: PIECES.city - citiesBuilt(g, p),
});

/** Settlement spot check: empty, no building one edge away, and (after setup) touching your own road. */
export function canSettle(g: CatanGame, p: number, v: number, setup = false): boolean {
  if (g.buildings[v] !== null || g.buildings[v] === undefined) return false;
  if (VERTEX_NEIGHBORS[v]!.some((n) => g.buildings[n] !== null)) return false;
  return setup || VERTEX_EDGES[v]!.some((e) => g.roads[e] === p);
}

/** Road spot check: empty and joined to your own building or road (not through an opponent's building). */
export function canRoad(g: CatanGame, p: number, e: number, setupVertex: number | null = null): boolean {
  if (g.roads[e] !== null || g.roads[e] === undefined) return false;
  const ends = EDGES[e]!;
  if (setupVertex !== null) return ends.includes(setupVertex);
  return ends.some((v) => {
    const b = g.buildings[v];
    if (b) return b.owner === p;
    return VERTEX_EDGES[v]!.some((o) => o !== e && g.roads[o] === p);
  });
}

export function legalSettlements(g: CatanGame, p: number, setup = false): number[] {
  return g.buildings.flatMap((_, v) => (canSettle(g, p, v, setup) ? [v] : []));
}

export function legalRoads(g: CatanGame, p: number, setupVertex: number | null = null): number[] {
  return g.roads.flatMap((_, e) => (canRoad(g, p, e, setupVertex) ? [e] : []));
}

export function legalCities(g: CatanGame, p: number): number[] {
  return g.buildings.flatMap((b, v) => (b && b.owner === p && !b.city ? [v] : []));
}

/** How many of each resource it takes to get 1 from the bank: 4, or 3/2 with a harbor. */
export function tradeRatios(g: CatanGame, p: number): Record<Resource, number> {
  let base = 4;
  const out = Object.fromEntries(RESOURCES.map((r) => [r, 4])) as Record<Resource, number>;
  for (const h of g.board.harbors) {
    const [a, b] = EDGES[h.edge]!;
    if (g.buildings[a]?.owner !== p && g.buildings[b]?.owner !== p) continue;
    if (h.kind === "any") base = 3;
    else out[h.kind] = 2;
  }
  for (const r of RESOURCES) out[r] = Math.min(out[r], base);
  return out;
}

/** Points everyone can see: buildings, longest road, largest army. */
export function publicVp(g: CatanGame, p: number): number {
  let vp = settlementsBuilt(g, p) + 2 * citiesBuilt(g, p);
  if (g.longestRoad === p) vp += 2;
  if (g.largestArmy === p) vp += 2;
  return vp;
}

/** All points, including victory-point cards held in secret. */
export function totalVp(g: CatanGame, p: number): number {
  const pl = g.players[p]!;
  return publicVp(g, p) + [...pl.dev, ...pl.newDev].filter((c) => c === "vp").length;
}

/** Players (other than `p`) with a building on the hex and at least one card. */
export function robbable(g: CatanGame, p: number, hex: number): number[] {
  const out = new Set<number>();
  for (const v of HEX_VERTICES[hex]!) {
    const b = g.buildings[v];
    if (!b || b.owner === p) continue;
    const owner = g.players[b.owner]!;
    if (!owner.gone && RESOURCES.some((r) => owner.hand[r] > 0)) out.add(b.owner);
  }
  return [...out].sort((a, b) => a - b);
}
