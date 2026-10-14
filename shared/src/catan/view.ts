// What each screen is allowed to see. Everyone gets the public view (board, pieces, card counts,
// points without hidden VP cards). Each player also gets their own private view (their hand and
// development cards). Nobody's browser ever gets other hands or the deck order.

import { longestRoad } from "./awards.ts";
import { piecesLeft, publicVp, totalVp } from "./pieces.ts";
import { handSize, type Board, type Building, type CatanGame, type EndVote, type DevCard, type Hand, type Phase, type TradeOffer } from "./types.ts";

export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  cards: number;
  devCards: number;
  knights: number;
  vp: number;
  roadLength: number;
  pieces: { road: number; settlement: number; city: number };
  gone: boolean;
  /** Cards still to discard after a 7. */
  discard: number;
}

export interface CatanView {
  board: Board;
  robber: number;
  players: PublicPlayer[];
  buildings: (Building | null)[];
  roads: (number | null)[];
  bank: Hand;
  deckLeft: number;
  phase: Phase;
  setupStep: number;
  setupPiece: "settlement" | "road";
  setupVertex: number | null;
  turn: number;
  dice: [number, number] | null;
  rollId: number;
  devPlayed: boolean;
  stealFrom: number[];
  offer: TradeOffer | null;
  freeRoads: number;
  longestRoad: number | null;
  largestArmy: number | null;
  winner: number | null;
  /** A vote to end the game early, if one is going. */
  endVote: EndVote | null;
  /** Final scores (with VP cards) once the game is over. */
  finalVp: number[] | null;
  log: string[];
}

export interface CatanPrivate {
  player: number;
  hand: Hand;
  dev: DevCard[];
  newDev: DevCard[];
  vp: number;
}

export function publicView(g: CatanGame): CatanView {
  return {
    board: g.board,
    robber: g.robber,
    players: g.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      cards: handSize(p.hand),
      devCards: p.dev.length + p.newDev.length,
      knights: p.knights,
      vp: publicVp(g, i),
      roadLength: longestRoad(g, i),
      pieces: piecesLeft(g, i),
      gone: p.gone,
      discard: g.discards[i] ?? 0,
    })),
    buildings: g.buildings,
    roads: g.roads,
    bank: g.bank,
    deckLeft: g.deck.length,
    phase: g.phase,
    setupStep: g.setupStep,
    setupPiece: g.setupPiece,
    setupVertex: g.setupVertex,
    turn: g.turn,
    dice: g.dice,
    rollId: g.rollId,
    devPlayed: g.devPlayed,
    stealFrom: g.stealFrom,
    offer: g.offer,
    freeRoads: g.freeRoads,
    longestRoad: g.longestRoad,
    largestArmy: g.largestArmy,
    winner: g.winner,
    endVote: g.endVote,
    finalVp: g.phase === "over" ? g.players.map((_, i) => totalVp(g, i)) : null,
    log: g.log,
  };
}

export function privateView(g: CatanGame, p: number): CatanPrivate {
  const pl = g.players[p]!;
  return { player: p, hand: pl.hand, dev: pl.dev, newDev: pl.newDev, vp: totalVp(g, p) };
}
