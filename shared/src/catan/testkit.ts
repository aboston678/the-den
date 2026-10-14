// Helpers for the Catan tests (not exported from the package).

import { rng } from "../world/noise.ts";
import { newGame } from "./game.ts";
import { legalRoads, legalSettlements } from "./pieces.ts";
import { apply, type CatanAction, type RuleContext } from "./rules.ts";
import { HEX_VERTICES } from "./topology.ts";
import { RESOURCES, type CatanGame, type Hand } from "./types.ts";

export const NAMES = ["Ann", "Bob", "Cat", "Dan"];

/** Context whose dice come from a list (repeating), with seeded luck for steals. */
export function dice(rolls: [number, number][] = [[3, 4]], seed = 1): RuleContext {
  let i = 0;
  return { rand: rng(seed), roll: () => rolls[i++ % rolls.length]! };
}

export function start(n = 3, seed = 1): CatanGame {
  return newGame(NAMES.slice(0, n).map((name, i) => ({ id: `s${i}`, name, seat: i })), rng(seed));
}

/** Plays a move that must be legal. */
export function act(g: CatanGame, p: number, a: CatanAction, ctx: RuleContext = dice()): CatanGame {
  const r = apply(g, p, a, ctx);
  if (!r.ok) throw new Error(`${a.type} by ${p} refused: ${r.error}`);
  return r.game;
}

/** Plays a move that must be refused; returns the reason. */
export function refused(g: CatanGame, p: number, a: CatanAction, ctx: RuleContext = dice()): string {
  const r = apply(g, p, a, ctx);
  if (r.ok) throw new Error(`${a.type} by ${p} should have been refused`);
  return r.error;
}

/** Runs setup with each player taking the first legal spots. */
export function quickSetup(g: CatanGame): CatanGame {
  while (g.phase === "setup") {
    const p = g.turn;
    g = act(g, p, { type: "placeSettlement", vertex: legalSettlements(g, p, true)[0]! });
    g = act(g, p, { type: "placeRoad", edge: legalRoads(g, p, g.setupVertex)[0]! });
  }
  return g;
}

/** Moves cards from the bank into a player's hand (test setup only). */
export function give(g: CatanGame, p: number, cards: Partial<Hand>) {
  for (const r of RESOURCES) {
    const n = cards[r] ?? 0;
    g.bank[r] -= n;
    g.players[p]!.hand[r] += n;
  }
}

/** Empties every hand back into the bank. */
export function clearHands(g: CatanGame) {
  for (const pl of g.players) give(g, g.players.indexOf(pl), Object.fromEntries(RESOURCES.map((r) => [r, -pl.hand[r]])));
}

/** A hex with this token (and its corners). */
export function hexWith(g: CatanGame, token: number) {
  const h = g.board.tiles.findIndex((t) => t.token === token);
  return { hex: h, corners: HEX_VERTICES[h]! };
}

/** An empty board in the main phase on player 0's turn, for building tests. */
export function emptyMain(n = 3, seed = 1): CatanGame {
  const g = start(n, seed);
  g.phase = "main";
  g.turn = 0;
  return g;
}
