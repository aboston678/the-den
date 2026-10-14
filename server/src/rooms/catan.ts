import {
  CATAN_MAX_PLAYERS, CATAN_MIN_PLAYERS, CATAN_RECONNECT_S, CATAN_SEATS, SIT_REACH, apply, expireEndVote, newGame, parseAction, privateView, publicView, removePlayer,
  type CatanGame, type CatanPrivate, type Hand, RESOURCES,
} from "@den/shared";
import { rollDice } from "@den/shared/catan-dice";
import type { CatanTable, Player } from "./PartyState.ts";

// Catan on the server (GAME_SPEC §16). Bears sit in the 4 dining chairs; any seated bear starts a
// game for everyone seated (2–4). The server holds the whole game; the table's synced `view` is
// only what everyone may see, and each player's own cards go to them by private message.
//
// House dice (Andrew, GAME_SPEC §16): holding H while starting sets `house` for that game. It lives
// only in this object (never in the synced state, the view, the log or any message to others) and
// clears when the game ends.

export interface CatanResult {
  winnerId: string | null;
  winnerName: string;
  vp: number;
  /** Session ids of everyone who finished the game. */
  playerIds: string[];
}

type Players = { get(id: string): Player | undefined };

export class Catan {
  private game: CatanGame | null = null;
  private house = false;
  /** Next roll's dice (dev and tests only). */
  private forced: [number, number] | null = null;
  /** Dropped players still in the game: session id → when they'll be removed (ms). */
  private dropped = new Map<string, number>();
  private reported = false;

  constructor(private rand: () => number = Math.random) {}

  /** Empty chairs for a new table. */
  setup(table: CatanTable) {
    while (table.seats.length < CATAN_SEATS.length) table.seats.push("");
  }

  get running() {
    return this.game !== null && this.game.phase !== "over";
  }

  /** Index of this bear in the running game, or -1. */
  playerIndex(id: string) {
    return this.running ? this.game!.players.findIndex((p) => p.id === id && !p.gone) : -1;
  }

  sit(table: CatanTable, id: string, p: Player, seat: number): boolean {
    const s = CATAN_SEATS[seat];
    if (!s || table.seats[seat] !== "" || table.seats.includes(id)) return false;
    if (Math.hypot(p.x - s.x, p.z - s.z) > SIT_REACH + 0.3 || Math.abs(p.y - s.y) > 1.5) return false;
    table.seats[seat] = id;
    return true;
  }

  /** Get up. Mid-game that means leaving the game (the browser asks first). */
  stand(table: CatanTable, id: string, now = Date.now()): boolean {
    const seat = table.seats.indexOf(id);
    if (seat < 0) return false;
    this.quit(table, id, now);
    table.seats[seat] = "";
    return true;
  }

  /** Start a game for everyone seated. `house` = Andrew's prank dice for this game. */
  start(table: CatanTable, id: string, players: Players, house: boolean): boolean {
    if (this.running || !table.seats.includes(id)) return false;
    const seated = [...table.seats].flatMap((sid, seat) => (sid ? [{ id: sid, name: players.get(sid)?.name ?? "Bear", seat }] : []));
    if (seated.length < CATAN_MIN_PLAYERS || seated.length > CATAN_MAX_PLAYERS) return false;
    // A random first player, then clockwise round the table.
    const first = Math.floor(this.rand() * seated.length);
    const order = [...seated.slice(first), ...seated.slice(0, first)];
    this.game = newGame(order, this.rand);
    this.house = house;
    this.forced = null;
    this.dropped.clear();
    this.reported = false;
    this.sync(table);
    return true;
  }

  /** A move from a player. Returns null when it worked, or the reason it didn't. */
  act(table: CatanTable, id: string, raw: unknown, now: number): string | null {
    const p = this.playerIndex(id);
    if (!this.game || p < 0) return "You're not in this game";
    const action = parseAction(raw);
    if (!action) return "That move doesn't make sense";
    // While the table waits for someone to reconnect, the only thing to do is vote to stop.
    const vote = action.type === "proposeEnd" || action.type === "voteEnd";
    if (this.dropped.size > 0 && !vote) return "Waiting for a player to reconnect";
    const ctx = {
      now,
      rand: this.rand,
      roll: () => {
        const dice = this.forced ?? rollDice(this.house ? "house" : "fair", this.rand);
        this.forced = null;
        return dice;
      },
    };
    const r = apply(this.game, p, action, ctx);
    if (!r.ok) return r.error;
    this.game = r.game;
    this.sync(table);
    return null;
  }

  /** Leave the game you're in (your cards go back to the bank, your pieces stay). */
  quit(table: CatanTable, id: string, now: number) {
    const p = this.playerIndex(id);
    if (p < 0 || !this.game) return;
    this.game = removePlayer(this.game, p);
    this.dropped.delete(id);
    this.sync(table);
  }

  /** A seated player's connection dropped: the game waits for them (GAME_SPEC §16). */
  drop(table: CatanTable, id: string, now: number) {
    if (this.playerIndex(id) < 0) return;
    this.dropped.set(id, now + CATAN_RECONNECT_S * 1000);
    this.sync(table);
  }

  back(table: CatanTable, id: string) {
    if (this.dropped.delete(id)) this.sync(table);
  }

  /** Someone left the party: out of the game and out of their chair. */
  leave(table: CatanTable, id: string, now: number) {
    this.quit(table, id, now);
    const seat = table.seats.indexOf(id);
    if (seat >= 0) table.seats[seat] = "";
  }

  /** Removes players who didn't come back in time; returns a finished game once. */
  tick(table: CatanTable, now: number): CatanResult | null {
    for (const [id, until] of this.dropped) if (now >= until) this.quit(table, id, now);
    if (this.game?.endVote) {
      const g = expireEndVote(this.game, now);
      if (g !== this.game) {
        this.game = g;
        this.sync(table);
      }
    }
    const g = this.game;
    if (!g || g.phase !== "over" || this.reported) return null;
    this.reported = true;
    this.house = false;
    this.dropped.clear();
    const winner = g.winner === null ? null : g.players[g.winner]!;
    return {
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? "",
      vp: publicView(g).finalVp?.[g.winner ?? 0] ?? 0,
      playerIds: g.players.filter((p) => !p.gone).map((p) => p.id),
    };
  }

  /** This bear's own cards, if they're in the game. */
  privateFor(id: string): CatanPrivate | null {
    if (!this.game) return null;
    const p = this.game.players.findIndex((pl) => pl.id === id && !pl.gone);
    return p < 0 ? null : privateView(this.game, p);
  }

  /** Dev and tests: the next roll, cards from the bank, and the deck's victory point cards. */
  dev(table: CatanTable, id: string, dice: unknown, give: unknown, vp = false) {
    if (Array.isArray(dice) && dice.length === 2 && dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) this.forced = [dice[0], dice[1]];
    const p = this.playerIndex(id);
    if (p < 0 || !this.game) return;
    const pl = this.game.players[p]!;
    if (give && typeof give === "object") {
      for (const r of RESOURCES) {
        const n = Math.max(0, Math.min(this.game.bank[r], Number((give as Partial<Hand>)[r]) || 0));
        this.game.bank[r] -= n;
        pl.hand[r] += n;
      }
    }
    if (vp) {
      pl.dev.push(...this.game.deck.filter((c) => c === "vp"));
      this.game.deck = this.game.deck.filter((c) => c !== "vp");
    }
    this.sync(table);
  }

  /** Test helper: is this game on house dice? (Never sent anywhere.) */
  get houseDice() {
    return this.house;
  }

  private sync(table: CatanTable) {
    if (!this.game) return;
    table.view = JSON.stringify(publicView(this.game));
    const waiting = [...this.dropped.entries()].sort((a, b) => a[1] - b[1])[0];
    table.waitingFor = waiting ? this.game.players.find((p) => p.id === waiting[0])?.name ?? "" : "";
    table.waitUntil = waiting ? waiting[1] : 0;
  }
}
