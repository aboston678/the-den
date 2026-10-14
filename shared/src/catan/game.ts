// Starting a game, turn order, and taking a player out when they leave mid-game.

import { updateLargestArmy, updateLongestRoad } from "./awards.ts";
import { BANK_EACH, pay } from "./pieces.ts";
import { generateBoard, shuffle } from "./board.ts";
import { EDGES, VERTICES } from "./topology.ts";
import { RESOURCES, cloneGame, emptyHand, type CatanGame, type DevCard } from "./types.ts";

export const CATAN_MIN_PLAYERS = 2;
export const CATAN_MAX_PLAYERS = 4;
const LOG_KEEP = 40;

export const DEV_DECK: readonly DevCard[] = [
  ...Array<DevCard>(14).fill("knight"),
  ...Array<DevCard>(5).fill("vp"),
  "roadBuilding",
  "roadBuilding",
  "yearOfPlenty",
  "yearOfPlenty",
  "monopoly",
  "monopoly",
];

export interface Seated {
  id: string;
  name: string;
  seat: number;
}

/** A new game for 2–4 players, in the order given (first player goes first). */
export function newGame(seated: readonly Seated[], rand: () => number): CatanGame {
  const board = generateBoard(rand);
  const bank = emptyHand();
  for (const r of RESOURCES) bank[r] = BANK_EACH;
  return {
    board,
    robber: board.tiles.findIndex((t) => t.terrain === "desert"),
    players: seated.map((s) => ({ ...s, hand: emptyHand(), dev: [], newDev: [], knights: 0, gone: false })),
    buildings: Array(VERTICES.length).fill(null),
    roads: Array(EDGES.length).fill(null),
    bank,
    deck: shuffle(DEV_DECK, rand),
    phase: "setup",
    setupStep: 0,
    setupPiece: "settlement",
    setupVertex: null,
    turn: 0,
    dice: null,
    rollId: 0,
    devPlayed: false,
    discards: seated.map(() => 0),
    robberReturn: "main",
    stealFrom: [],
    offer: null,
    offerCount: 0,
    freeRoads: 0,
    longestRoad: null,
    largestArmy: null,
    winner: null,
    log: [`Game on: ${seated.map((s) => s.name).join(", ")}`],
  };
}

/** Setup placement order: 0,1,2,3 then 3,2,1,0. */
export function setupOrder(n: number): number[] {
  const fwd = Array.from({ length: n }, (_, i) => i);
  return [...fwd, ...fwd.slice().reverse()];
}

export const activePlayers = (g: CatanGame) => g.players.filter((p) => !p.gone).length;

export function log(g: CatanGame, line: string) {
  g.log.push(line);
  if (g.log.length > LOG_KEEP) g.log.splice(0, g.log.length - LOG_KEEP);
}

/** Next setup step whose player is still here; moves on to the first roll when setup is done. */
export function advanceSetup(g: CatanGame) {
  const order = setupOrder(g.players.length);
  g.setupPiece = "settlement";
  g.setupVertex = null;
  let s = g.setupStep + 1;
  while (s < order.length && g.players[order[s]!]!.gone) s++;
  g.setupStep = s;
  if (s < order.length) {
    g.turn = order[s]!;
    return;
  }
  g.phase = "roll";
  g.turn = g.players.findIndex((p) => !p.gone);
}

/** Next player still in the game. */
export function nextTurn(g: CatanGame) {
  const n = g.players.length;
  for (let i = 1; i <= n; i++) {
    const t = (g.turn + i) % n;
    if (!g.players[t]!.gone) {
      g.turn = t;
      return;
    }
  }
}

/** Hands the turn on: new cards become playable, the board waits for a roll. */
export function startNextTurn(g: CatanGame) {
  const cur = g.players[g.turn]!;
  cur.dev.push(...cur.newDev);
  cur.newDev = [];
  g.devPlayed = false;
  g.freeRoads = 0;
  g.offer = null;
  g.stealFrom = [];
  nextTurn(g);
  g.phase = "roll";
}

/** Takes a player out (disconnected too long). Their cards go back to the bank; their pieces stay. */
export function removePlayer(g: CatanGame, p: number): CatanGame {
  const out = cloneGame(g);
  const pl = out.players[p];
  if (!pl || pl.gone || out.phase === "over") return out;
  pl.gone = true;
  pay(pl.hand, out.bank, { ...pl.hand });
  pl.dev = [];
  pl.newDev = [];
  out.discards[p] = 0;
  out.stealFrom = out.stealFrom.filter((i) => i !== p);
  if (out.offer) delete out.offer.replies[p];
  log(out, `${pl.name} left the game`);
  updateLongestRoad(out);
  updateLargestArmy(out);
  if (activePlayers(out) < CATAN_MIN_PLAYERS) {
    out.phase = "over";
    out.winner = null;
    return out;
  }
  if (out.turn === p) {
    if (out.phase === "setup") {
      advanceSetup(out);
    } else {
      out.devPlayed = false;
      out.freeRoads = 0;
      out.offer = null;
      out.stealFrom = [];
      nextTurn(out);
      out.phase = "roll";
    }
  } else if (out.phase === "discard" && out.discards.every((d) => d === 0)) {
    out.phase = "robber";
  } else if (out.phase === "steal" && out.stealFrom.length === 0) {
    out.phase = out.robberReturn;
  }
  return out;
}
