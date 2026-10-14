import type { CatanPrivate, CatanView } from "@den/shared";
import { create } from "zustand";

// What the browser knows about the Catan table (GAME_SPEC §16), filled from the party room
// (net/party.ts): who sits where, the game as everyone sees it, and your own cards.

export interface CatanStore {
  /** Session id in each of the 4 chairs ("" = empty), clockwise from the north side. */
  seats: string[];
  view: CatanView | null;
  /** Your own hand and development cards (only while you're in the game). */
  mine: CatanPrivate | null;
  /** A dropped player the game is waiting for, and when they'll be removed (ms since 1970). */
  waitingFor: string;
  waitUntil: number;
  /** Why your last move was refused. */
  error: { text: string; at: number } | null;
  /** When the server last said OK to a start you asked for (performance.now()), for the tiny tick. */
  ok: number;
  /** Wins announced to the party (newest last). */
  wins: { id: string; name: string; vp: number; at: number; mine: boolean }[];
}

export const EMPTY_SEATS = ["", "", "", ""];

export const useCatan = create<CatanStore>(() => ({ seats: EMPTY_SEATS, view: null, mine: null, waitingFor: "", waitUntil: 0, error: null, ok: 0, wins: [] }));

export const resetCatan = () =>
  useCatan.setState({ seats: EMPTY_SEATS, view: null, mine: null, waitingFor: "", waitUntil: 0, error: null, ok: 0, wins: [] });

/** Your index in the game, or -1 when you're not playing. */
export function myPlayer(me: string): number {
  const v = useCatan.getState().view;
  if (!v || v.phase === "over") return -1;
  return v.players.findIndex((p) => p.id === me && !p.gone);
}

/** Player colours by seat (red, blue, white, orange, like the box). */
export const SEAT_COLOURS = ["#c8382c", "#2f5fb8", "#f2efe6", "#e58a1f"] as const;
export const SEAT_COLOUR_NAMES = ["Red", "Blue", "White", "Orange"] as const;
