import { BIKE_MAX_SPEED, WHEELIE } from "./bike.ts";
import { WORLD_LIMITS } from "./track.ts";
import { BEAR } from "./constants.ts";

// Networking rules shared by the browser and the game server (GAME_SPEC §7).

/** Message types clients send to the party room. */
export const MSG = {
  pose: "pose", // 20 Hz: where my bear is and what it's doing
  start: "start", // host only: lobby -> playing
  door: "door", // { id }: open or close a door you're standing next to
  devTime: "devTime", // { time }: jump the day/night clock (dev and tests only; ignored in production)
  rod: "rod", // { take }: take a rod from the bucket at the dock, or put it back (GAME_SPEC §13)
  cast: "cast", // { x, z }: cast the lure to this point on the water
  reel: "reel", // one press of R: reel in (strikes on a bite, fights a hooked fish)
  reelIn: "reelIn", // wind the lure back in without a fish
  devFish: "devFish", // { biteIn, species?, weight? }: next bite after this many seconds (dev and tests only)
  // Bowling (GAME_SPEC §15): the server owns turns and scores; the bowler's browser runs the ball and pins.
  bowlJoin: "bowlJoin", // { lane }: join a lane at its ball return (before or between games)
  bowlLeave: "bowlLeave", // leave your lane
  bowlNewGame: "bowlNewGame", // { lane }: start a new game once the last one's over
  bowlRolling: "bowlRolling", // { lane }: my ball's on its way
  bowlResult: "bowlResult", // { lane, knocked }: which standing pins my ball knocked down (bit mask)
  bowlFrame: "bowlFrame", // BowlFrame: where my ball and pins are (20 Hz while they move), passed on to everyone else
  devBowl: "devBowl", // { lane, rolls }: set my balls so far in this game (dev and tests only)
  // Catan (GAME_SPEC §16): the server owns the game; browsers send moves and get back what they may see.
  catanSit: "catanSit", // { seat }: sit in a chair at the dining table (you must be next to it)
  catanStand: "catanStand", // get up (not while you're in a game that's still going)
  catanStart: "catanStart", // { h? }: start a game with everyone seated (2–4)
  catanAct: "catanAct", // { action }: a move (CatanAction), checked against the rules
  catanQuit: "catanQuit", // leave the game you're in (your cards go back to the bank)
  devCatan: "devCatan", // { dice?, give? }: next roll / extra cards for me (dev and tests only)
  // Connect Four (Andrew, 2026-10-16): two chairs at the games table in the basement stair landing.
  c4Sit: "c4Sit", // { seat }: sit in a chair (you must be next to it)
  c4Stand: "c4Stand", // get up (mid-game that's leaving the game)
  c4Start: "c4Start", // start a game (both chairs taken)
  c4Act: "c4Act", // { action }: a move (C4Action), checked against the rules
  // The motorcycle (Andrew, 2026-10-16).
  bike: "bike", // { do: "take" | "mount" | "park", x?, y?, z?, yaw? }: take the garage bike, get on yours, park it where it is
  lap: "lap", // { s }: I just finished a lap of the racetrack in s seconds (timed in my browser, checked here)
} as const;

/** Messages the server sends to everyone in the party. */
export const SERVER_MSG = {
  /** { id, name, species, weight, best }: someone landed a fish. */
  caught: "caught",
  /** BowlFrame from another bowler (see MSG.bowlFrame). */
  bowlFrame: "bowlFrame",
  /** { id, name, lane, score, best }: someone finished a game of bowling. */
  bowled: "bowled",
  /** CatanPrivate: your own hand and development cards (sent only to you). */
  catanPrivate: "catanPrivate",
  /** { error }: why your Catan move was refused (sent only to you). */
  catanError: "catanError",
  /** {}: sent only to the bear who started the game, when they asked for it. */
  catanOk: "catanOk",
  /** { id, name, vp }: someone won at Catan. */
  catanWon: "catanWon",
  /** { error }: why your Connect Four move was refused (sent only to you). */
  c4Error: "c4Error",
  /** { id, name }: someone won at Connect Four. */
  c4Won: "c4Won",
  /** { id, name, s, best, record }: someone finished a lap (best = their best this visit, record = the party's best). */
  lap: "lap",
} as const;

export const BEAR_ACTIONS = ["locomotion", "jump", "fall", "roar", "dance", "cast", "reel", "celebrate", "bowl", "sit", "stand", "crouch", "ride"] as const;
export type BearAction = (typeof BEAR_ACTIONS)[number];

export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  action: BearAction;
  /** Flashlight on (F), and where it points: compass angle and up/down angle, radians (GAME_SPEC §9). */
  flashlight: boolean;
  aimYaw: number;
  aimPitch: number;
  /** On a bike: how far the front wheel is up (radians, 0 = both wheels down). */
  wheelie: number;
}

/** Map bounds the server accepts: the property and, out to the north-west, the road and the racetrack. */
const LIMITS = WORLD_LIMITS;

/**
 * Validate a pose from a client. Movement is client-authoritative (GAME_SPEC §3) but the
 * server clamps it: no faster than a sprint (with slack for network jitter), no leaving the map.
 * Returns the pose the server should store.
 */
export function sanitizePose(input: unknown, prev: Pose, seconds: number, riding = false): Pose {
  const raw = (input ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  let x = clampN(num(raw.x, prev.x), LIMITS.minX, LIMITS.maxX);
  let z = clampN(num(raw.z, prev.z), LIMITS.minZ, LIMITS.maxZ);
  const y = clampN(num(raw.y, prev.y), -30, 60);

  // At most sprint speed × 1.5 for the elapsed time, plus a metre of slack (a bike's top speed while riding).
  const top = riding ? BIKE_MAX_SPEED * 1.2 : BEAR.sprintSpeed * 1.5;
  const maxStep = top * Math.max(0, Math.min(seconds, 1)) + 1;
  const dx = x - prev.x, dz = z - prev.z;
  const dist = Math.hypot(dx, dz);
  if (dist > maxStep) {
    x = prev.x + (dx / dist) * maxStep;
    z = prev.z + (dz / dist) * maxStep;
  }

  let action = BEAR_ACTIONS.includes(raw.action as BearAction) ? (raw.action as BearAction) : prev.action;
  if (action === "ride" && !riding) action = "locomotion"; // only on a bike the server gave you
  return {
    x,
    y,
    z,
    yaw: num(raw.yaw, prev.yaw) % (Math.PI * 2),
    speed: clampN(num(raw.speed, 0), 0, riding ? BIKE_MAX_SPEED * 1.1 : BEAR.sprintSpeed * 1.2),
    action,
    flashlight: typeof raw.flashlight === "boolean" ? raw.flashlight : prev.flashlight,
    aimYaw: num(raw.aimYaw, prev.aimYaw) % (Math.PI * 2),
    aimPitch: clampN(num(raw.aimPitch, prev.aimPitch), -1.4, 1.4),
    wheelie: riding ? clampN(num(raw.wheelie, 0), 0, WHEELIE.max) : 0,
  };
}
