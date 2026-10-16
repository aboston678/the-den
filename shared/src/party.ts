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
} as const;

export const BEAR_ACTIONS = ["locomotion", "jump", "fall", "roar", "dance", "cast", "reel", "celebrate", "bowl", "sit", "stand", "crouch"] as const;
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
}

/** Map bounds the server accepts (the world is 300 m × 300 m around the origin). */
export const WORLD_HALF_SIZE = 150;

/**
 * Validate a pose from a client. Movement is client-authoritative (GAME_SPEC §3) but the
 * server clamps it: no faster than a sprint (with slack for network jitter), no leaving the map.
 * Returns the pose the server should store.
 */
export function sanitizePose(input: unknown, prev: Pose, seconds: number): Pose {
  const raw = (input ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  let x = clampN(num(raw.x, prev.x), -WORLD_HALF_SIZE, WORLD_HALF_SIZE);
  let z = clampN(num(raw.z, prev.z), -WORLD_HALF_SIZE, WORLD_HALF_SIZE);
  const y = clampN(num(raw.y, prev.y), -30, 60);

  // At most sprint speed × 1.5 for the elapsed time, plus a metre of slack.
  const maxStep = BEAR.sprintSpeed * 1.5 * Math.max(0, Math.min(seconds, 1)) + 1;
  const dx = x - prev.x, dz = z - prev.z;
  const dist = Math.hypot(dx, dz);
  if (dist > maxStep) {
    x = prev.x + (dx / dist) * maxStep;
    z = prev.z + (dz / dist) * maxStep;
  }

  const action = BEAR_ACTIONS.includes(raw.action as BearAction) ? (raw.action as BearAction) : prev.action;
  return {
    x,
    y,
    z,
    yaw: num(raw.yaw, prev.yaw) % (Math.PI * 2),
    speed: clampN(num(raw.speed, 0), 0, BEAR.sprintSpeed * 1.2),
    action,
    flashlight: typeof raw.flashlight === "boolean" ? raw.flashlight : prev.flashlight,
    aimYaw: num(raw.aimYaw, prev.aimYaw) % (Math.PI * 2),
    aimPitch: clampN(num(raw.aimPitch, prev.aimPitch), -1.4, 1.4),
  };
}
