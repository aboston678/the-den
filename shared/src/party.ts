import { BEAR } from "./constants.ts";

// Networking rules shared by the browser and the game server (GAME_SPEC §7).

/** Message types clients send to the party room. */
export const MSG = {
  pose: "pose", // 20 Hz: where my bear is and what it's doing
  start: "start", // host only: lobby -> playing
} as const;

export const BEAR_ACTIONS = ["locomotion", "jump", "fall", "roar", "dance"] as const;
export type BearAction = (typeof BEAR_ACTIONS)[number];

export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  action: BearAction;
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
  };
}
