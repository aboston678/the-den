import { C4_PLAYERS, C4_SEATS, CATAN_RECONNECT_S, SIT_REACH, type C4Game, applyC4, leaveC4, newC4Game, parseC4Action } from "@den/shared";
import type { C4Table, Player } from "./PartyState.ts";

// Connect Four on the server (Andrew, 2026-10-16), a small copy of the Catan table: two bears sit
// in the chairs, either starts a game (a random one goes first, as red), moves go through the
// shared rules, and the whole game is the synced view (nothing secret). Getting up mid-game leaves
// it (no winner); a dropped player gets the same 60 s as Catan before they're out.

export interface C4Result {
  winnerId: string | null;
  winnerName: string;
  /** Session ids of the players. */
  playerIds: string[];
}

type Players = { get(id: string): Player | undefined };

export class Connect4 {
  private game: C4Game | null = null;
  /** Dropped players still in the game: session id → when they'll be removed (ms). */
  private dropped = new Map<string, number>();
  private reported = false;

  constructor(private rand: () => number = Math.random) {}

  setup(table: C4Table) {
    while (table.seats.length < C4_SEATS.length) table.seats.push("");
  }

  get running() {
    return this.game !== null && this.game.phase !== "over";
  }

  /** Index of this bear in the running game, or -1. */
  playerIndex(id: string) {
    return this.running ? this.game!.players.findIndex((p) => p.id === id && !p.gone) : -1;
  }

  sit(table: C4Table, id: string, p: Player, seat: number): boolean {
    const s = C4_SEATS[seat];
    if (!s || table.seats[seat] !== "" || table.seats.includes(id)) return false;
    if (Math.hypot(p.x - s.x, p.z - s.z) > SIT_REACH + 0.3 || Math.abs(p.y - s.y) > 1.5) return false;
    table.seats[seat] = id;
    return true;
  }

  /** Get up. Mid-game that means leaving the game (the browser asks first). */
  stand(table: C4Table, id: string): boolean {
    const seat = table.seats.indexOf(id);
    if (seat < 0) return false;
    this.quit(table, id);
    table.seats[seat] = "";
    return true;
  }

  start(table: C4Table, id: string, players: Players): boolean {
    if (this.running || !table.seats.includes(id)) return false;
    const seated = [...table.seats].flatMap((sid, seat) => (sid ? [{ id: sid, name: players.get(sid)?.name ?? "Bear", seat }] : []));
    if (seated.length !== C4_PLAYERS) return false;
    if (this.rand() < 0.5) seated.reverse(); // a random bear goes first, as red
    this.game = newC4Game(seated);
    this.dropped.clear();
    this.reported = false;
    this.sync(table);
    return true;
  }

  /** A move from a player. Returns null when it worked, or the reason it didn't. */
  act(table: C4Table, id: string, raw: unknown): string | null {
    const p = this.playerIndex(id);
    if (!this.game || p < 0) return "You're not in this game";
    if (this.dropped.size > 0) return "Waiting for a player to reconnect";
    const action = parseC4Action(raw);
    if (!action) return "That move doesn't make sense";
    const r = applyC4(this.game, p, action);
    if (!r.ok) return r.error;
    this.game = r.game;
    this.sync(table);
    return null;
  }

  /** Leave the game you're in: it ends with no winner. */
  quit(table: C4Table, id: string) {
    const p = this.playerIndex(id);
    if (p < 0 || !this.game) return;
    this.game = leaveC4(this.game, p);
    this.dropped.delete(id);
    this.sync(table);
  }

  drop(table: C4Table, id: string, now: number) {
    if (this.playerIndex(id) < 0) return;
    this.dropped.set(id, now + CATAN_RECONNECT_S * 1000);
    this.sync(table);
  }

  back(table: C4Table, id: string) {
    if (this.dropped.delete(id)) this.sync(table);
  }

  /** Someone left the party: out of the game and out of their chair. */
  leave(table: C4Table, id: string) {
    this.quit(table, id);
    const seat = table.seats.indexOf(id);
    if (seat >= 0) table.seats[seat] = "";
  }

  /** Removes players who didn't come back in time; returns a finished game once. */
  tick(table: C4Table, now: number): C4Result | null {
    for (const [id, until] of this.dropped) if (now >= until) this.quit(table, id);
    const g = this.game;
    if (!g || g.phase !== "over" || this.reported) return null;
    this.reported = true;
    this.dropped.clear();
    const winner = g.winner === null ? null : g.players[g.winner]!;
    return { winnerId: winner?.id ?? null, winnerName: winner?.name ?? "", playerIds: g.players.filter((p) => !p.gone).map((p) => p.id) };
  }

  private sync(table: C4Table) {
    if (!this.game) return;
    table.view = JSON.stringify(this.game);
    const waiting = [...this.dropped.entries()].sort((a, b) => a[1] - b[1])[0];
    table.waitingFor = waiting ? this.game.players.find((p) => p.id === waiting[0])?.name ?? "" : "";
    table.waitUntil = waiting ? waiting[1] : 0;
  }
}
