import type { C4Game } from "@den/shared";
import { create } from "zustand";

// What the browser knows about the Connect Four table (Andrew, 2026-10-16), filled from the party
// room (net/party.ts): who sits where and the game (nothing in it is secret).

export interface C4Store {
  /** Session id in each chair ("" = empty): north, south. */
  seats: string[];
  game: C4Game | null;
  /** A dropped player the game is waiting for, and when they'll be removed (ms since 1970). */
  waitingFor: string;
  waitUntil: number;
  /** Why your last move was refused. */
  error: { text: string; at: number } | null;
  /** Wins announced to the party (newest last). */
  wins: { id: string; name: string; at: number; mine: boolean }[];
  /** Asking "leave the game?" after E mid-game. */
  confirmLeave: boolean;
}

export const useC4 = create<C4Store>(() => ({ seats: ["", ""], game: null, waitingFor: "", waitUntil: 0, error: null, wins: [], confirmLeave: false }));

export const resetC4 = () => useC4.setState({ seats: ["", ""], game: null, waitingFor: "", waitUntil: 0, error: null, wins: [], confirmLeave: false });

/** Your index in the running game, or -1. */
export function myC4Player(me: string): number {
  const g = useC4.getState().game;
  if (!g || g.phase === "over") return -1;
  return g.players.findIndex((p) => p.id === me && !p.gone);
}

/** Disc colours: red goes first, then yellow. */
export const DISC_COLOURS = ["#d8332a", "#f4c82e"] as const;
