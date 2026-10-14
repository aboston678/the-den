// A fresh random board for each game: terrain, number tokens and harbors shuffled the standard way,
// with the official rule that the red numbers (6 and 8) never touch each other.

import { HARBOR_SLOTS, HEXES, HEX_NEIGHBORS } from "./topology.ts";
import type { Board, Harbor, Resource, Terrain, Tile } from "./types.ts";

export const TERRAINS: readonly Terrain[] = [
  ...Array<Terrain>(4).fill("forest"),
  ...Array<Terrain>(4).fill("pasture"),
  ...Array<Terrain>(4).fill("fields"),
  ...Array<Terrain>(3).fill("hills"),
  ...Array<Terrain>(3).fill("mountains"),
  "desert",
];

export const TOKENS: readonly number[] = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export const HARBOR_KINDS: readonly (Resource | "any")[] = ["any", "any", "any", "any", "lumber", "brick", "wool", "grain", "ore"];

/** Dots under a number token: how many of the 36 dice combinations make it (6 and 8 have 5). */
export const pips = (token: number) => 6 - Math.abs(7 - token);

/** 6s and 8s are the red numbers. */
export const isRed = (token: number | null) => token === 6 || token === 8;

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** True when no 6 or 8 sits next to another 6 or 8. */
export function redsApart(tiles: readonly Tile[]): boolean {
  return tiles.every((t, h) => !isRed(t.token) || HEX_NEIGHBORS[h]!.every((n) => !isRed(tiles[n]!.token)));
}

export function generateBoard(rand: () => number): Board {
  const terrain = shuffle(TERRAINS, rand);
  let tiles: Tile[];
  do {
    const tokens = shuffle(TOKENS, rand);
    let k = 0;
    tiles = HEXES.map((_, h) => ({ terrain: terrain[h]!, token: terrain[h] === "desert" ? null : tokens[k++]! }));
  } while (!redsApart(tiles));
  const kinds = shuffle(HARBOR_KINDS, rand);
  const harbors: Harbor[] = HARBOR_SLOTS.map((edge, i) => ({ edge, kind: kinds[i]! }));
  return { tiles, harbors };
}
