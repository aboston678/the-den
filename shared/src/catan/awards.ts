// Longest road and largest army: 2 points each, and ties keep the current holder.

import { EDGES, VERTEX_EDGES } from "./topology.ts";
import type { CatanGame } from "./types.ts";

export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;

/** Longest unbroken run of a player's roads. A run can end at an opponent's building but not pass through it. */
export function longestRoad(g: CatanGame, p: number): number {
  const used = new Set<number>();
  let best = 0;
  const walk = (v: number, len: number) => {
    if (len > best) best = len;
    for (const e of VERTEX_EDGES[v]!) {
      if (g.roads[e] !== p || used.has(e)) continue;
      const [a, b] = EDGES[e]!;
      const w = a === v ? b : a;
      const blocker = g.buildings[w];
      used.add(e);
      if (blocker && blocker.owner !== p) best = Math.max(best, len + 1);
      else walk(w, len + 1);
      used.delete(e);
    }
  };
  g.roads.forEach((o, e) => {
    if (o !== p) return;
    for (const v of EDGES[e]!) walk(v, 0);
  });
  return best;
}

/** Re-awards longest road after a road or settlement is built (or a player leaves). */
export function updateLongestRoad(g: CatanGame) {
  const lens = g.players.map((pl, i) => (pl.gone ? 0 : longestRoad(g, i)));
  const max = Math.max(...lens);
  const holder = g.longestRoad;
  if (holder !== null && !g.players[holder]!.gone && lens[holder] === max && max >= LONGEST_ROAD_MIN) return;
  const leaders = lens.flatMap((l, i) => (l === max ? [i] : []));
  g.longestRoad = max >= LONGEST_ROAD_MIN && leaders.length === 1 ? leaders[0]! : null;
}

/** Re-awards largest army after a knight is played (or a player leaves). */
export function updateLargestArmy(g: CatanGame) {
  if (g.largestArmy !== null && g.players[g.largestArmy]!.gone) g.largestArmy = null;
  const bar = g.largestArmy === null ? LARGEST_ARMY_MIN - 1 : g.players[g.largestArmy]!.knights;
  const ks = g.players.map((pl) => (pl.gone ? 0 : pl.knights));
  const max = Math.max(...ks);
  const leaders = ks.flatMap((k, i) => (k === max ? [i] : []));
  if (max > bar && leaders.length === 1) g.largestArmy = leaders[0]!;
}
