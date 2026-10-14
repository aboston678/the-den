import {
  APPROACH_WORLD_Y, JOIN_REACH, LANES, isGameOver, joinSpot, laneById, nextBall, pinsStanding, score, validRoll,
} from "@den/shared";
import { Bowler, type Lane, type Player } from "./PartyState.ts";

// Bowling on the server (GAME_SPEC §15): who's on each lane, whose turn it is, and the score.
// The bowler's browser runs the ball and pins and reports which pins fell; the server checks it
// (only the bowler whose turn it is, only pins that were standing, not impossibly fast) and keeps
// score with the shared rules (shared/src/bowling/scoring.ts).

const ALL = 0x3ff;
/** The pinsetter's turn before the next ball (seconds; the browsers animate it meanwhile). */
export const RESET_S = 3.2;
/** A ball can't be over sooner than this after it was rolled (seconds). */
const MIN_ROLL_S = 1.2;
/** A ball with no result after this long counts as a miss (the bowler's connection dropped). */
const MAX_ROLL_S = 25;
/** At the line this long without bowling: taken off the lane so others aren't stuck. */
export const IDLE_KICK_S = 120;
/** Walk this far from the ball return (world metres) and you've left the lane. */
const WALK_AWAY = 14;

export interface GameResult {
  id: string;
  name: string;
  lane: string;
  score: number;
}

type Lanes = { get(id: string): Lane | undefined; forEach(cb: (lane: Lane, id: string) => void): void };

const parse = (s: string) => (s ? s.split(",").map(Number) : []);
const popcount = (m: number) => {
  let n = 0;
  for (let i = 0; i < 10; i++) n += (m >> i) & 1;
  return n;
};

export class Bowling {
  /** When each lane's phase last changed (ms), and whether the turn passes after the reset. */
  private since = new Map<string, number>();
  private advance = new Map<string, boolean>();
  private finished: GameResult[] = [];

  /** Join a lane standing at its ball return, before or between games (max 4). */
  join(lanes: Lanes, laneId: string, id: string, p: Player, now: number): boolean {
    const lane = lanes.get(laneId), spec = laneById(laneId);
    if (!lane || !spec) return false;
    const spot = joinSpot(spec);
    if (Math.hypot(p.x - spot.x, p.z - spot.z) > JOIN_REACH + 1.5 || Math.abs(p.y - APPROACH_WORLD_Y) > 1.5) return false;
    if (lane.bowlers.some((b) => b.id === id)) return true;
    const inProgress = lane.phase !== "over" && lane.bowlers.some((b) => b.rolls !== "");
    if (inProgress || lane.bowlers.length >= 4) return false;
    this.leave(lanes, id, now);
    if (lane.phase === "over") this.reset(lane);
    const b = new Bowler();
    b.id = id;
    b.name = p.name;
    lane.bowlers.push(b);
    if (lane.phase === "idle") this.setPhase(laneId, lane, "aim", now);
    return true;
  }

  /** Leave whichever lane you're on. */
  leave(lanes: Lanes, id: string, now: number) {
    lanes.forEach((lane, laneId) => {
      const i = lane.bowlers.findIndex((b) => b.id === id);
      if (i < 0) return;
      const wasTurn = i === lane.turn;
      lane.bowlers.splice(i, 1);
      if (lane.bowlers.length === 0) {
        this.reset(lane);
        this.setPhase(laneId, lane, "idle", now);
        return;
      }
      if (i < lane.turn) lane.turn--;
      if (wasTurn && lane.phase !== "over") {
        // The next bowler (now at this index) is up with a fresh rack.
        lane.turn = lane.turn % lane.bowlers.length;
        lane.standing = ALL;
        this.nextUnfinished(laneId, lane, now, false);
      }
    });
  }

  /** Start again once a game's over (any bowler on the lane). */
  newGame(lanes: Lanes, laneId: string, id: string, now: number) {
    const lane = lanes.get(laneId);
    if (!lane || lane.phase !== "over" || !lane.bowlers.some((b) => b.id === id)) return;
    this.reset(lane);
    this.setPhase(laneId, lane, "aim", now);
  }

  /** Dev and tests: set your balls so far this game (a valid, unfinished game), ready for your next ball. */
  devSetRolls(lanes: Lanes, laneId: string, id: string, rolls: unknown, now: number) {
    const lane = lanes.get(laneId);
    const bowler = lane?.bowlers.find((b) => b.id === id);
    if (!lane || !bowler || !Array.isArray(rolls)) return;
    const ok: number[] = [];
    for (const r of rolls) {
      if (!validRoll(ok, r as number)) return;
      ok.push(r as number);
    }
    if (isGameOver(ok)) return;
    bowler.rolls = ok.join(",");
    lane.turn = lane.bowlers.indexOf(bowler);
    lane.standing = (1 << pinsStanding(ok)) - 1; // a fresh rack, or (mid-frame) the first few pins still up
    this.setPhase(laneId, lane, "aim", now);
  }

  /** The bowler whose turn it is has let go of the ball. */
  rolling(lanes: Lanes, laneId: string, id: string, now: number) {
    const lane = lanes.get(laneId);
    if (lane && lane.phase === "aim" && lane.bowlers[lane.turn]?.id === id) this.setPhase(laneId, lane, "rolling", now);
  }

  /** Which of the standing pins the bowler's ball knocked down (bit mask). */
  result(lanes: Lanes, laneId: string, id: string, knocked: number, now: number) {
    const lane = lanes.get(laneId);
    const bowler = lane?.bowlers[lane.turn];
    if (!lane || !bowler || bowler.id !== id || lane.phase !== "rolling") return;
    if (now - (this.since.get(laneId) ?? 0) < MIN_ROLL_S * 1000) return;
    if (!Number.isInteger(knocked) || knocked < 0 || knocked > ALL) return;
    this.record(laneId, lane, bowler, knocked & lane.standing, now);
  }

  private record(laneId: string, lane: Lane, bowler: Bowler, mask: number, now: number) {
    const rolls = parse(bowler.rolls);
    const n = popcount(mask);
    if (!validRoll(rolls, n)) return;
    rolls.push(n);
    bowler.rolls = rolls.join(",");
    const done = isGameOver(rolls);
    const frameDone = done || nextBall(rolls)?.ball === 0;
    lane.standing = frameDone || pinsStanding(rolls) === 10 ? ALL : lane.standing & ~mask;
    this.advance.set(laneId, frameDone);
    this.setPhase(laneId, lane, "reset", now);
  }

  /** Timers: the pinsetter, slow bowlers, lost balls, bowlers who wandered off. Returns finished games. */
  tick(lanes: Lanes, players: { get(id: string): Player | undefined }, now: number): GameResult[] {
    lanes.forEach((lane, laneId) => {
      const t = (now - (this.since.get(laneId) ?? now)) / 1000;
      if (lane.phase === "reset" && t >= RESET_S) this.nextUnfinished(laneId, lane, now, this.advance.get(laneId) ?? false);
      else if (lane.phase === "rolling" && t >= MAX_ROLL_S) this.record(laneId, lane, lane.bowlers[lane.turn]!, 0, now);
      else if (lane.phase === "aim" && t >= IDLE_KICK_S) this.leave(lanes, lane.bowlers[lane.turn]!.id, now);
      // Bowlers who walked away (or dropped out) leave the lane.
      for (const b of [...lane.bowlers]) {
        const p = players.get(b.id);
        const spot = joinSpot(laneById(laneId)!);
        if (!p || Math.hypot(p.x - spot.x, p.z - spot.z) > WALK_AWAY || Math.abs(p.y - APPROACH_WORLD_Y) > 2.5) this.leave(lanes, b.id, now);
      }
    });
    const out = this.finished;
    this.finished = [];
    return out;
  }

  /** Pass the turn on (if `advance`) to the next bowler still playing; game over when nobody is. */
  private nextUnfinished(laneId: string, lane: Lane, now: number, advance: boolean) {
    const n = lane.bowlers.length;
    for (let k = advance ? 1 : 0; k <= n; k++) {
      const i = (lane.turn + k) % n;
      if (!isGameOver(parse(lane.bowlers[i]!.rolls))) {
        lane.turn = i;
        if (k > 0) lane.standing = ALL;
        this.setPhase(laneId, lane, "aim", now);
        return;
      }
    }
    // Everyone's finished.
    lane.standing = ALL;
    this.setPhase(laneId, lane, "over", now);
    for (const b of lane.bowlers) this.finished.push({ id: b.id, name: b.name, lane: laneId, score: score(parse(b.rolls)) });
  }

  private reset(lane: Lane) {
    for (const b of lane.bowlers) b.rolls = "";
    lane.turn = 0;
    lane.standing = ALL;
  }

  private setPhase(laneId: string, lane: Lane, phase: string, now: number) {
    lane.phase = phase;
    this.since.set(laneId, now);
  }
}

/** The two lanes, ready in a fresh party. */
export const LANE_IDS = LANES.map((l) => l.id);
