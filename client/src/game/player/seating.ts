import type { CatanSeat } from "@den/shared";
import type { BearAction } from "../state.ts";
import type { BearAnimator } from "./BearAnimator.ts";

// Sitting in a Catan chair and getting back up (GAME_SPEC §16). The bear glides to the spot in
// front of the chair (so its hips land on the seat), plays the sit, stays seated while the chair is
// set, then plays the stand-up while gliding out beside the chair, clear of the table.

/** Seconds to glide from where you stood into the chair spot. */
const WALK_IN = 0.45;
/** The glide out while getting up: starts this far into the clip and takes this long. */
const OUT_DELAY = 0.35, OUT_TIME = 1.2;

export interface SeatMove {
  seat: CatanSeat;
  phase: "in" | "seated" | "out";
  t: number;
  from: { x: number; y: number; z: number };
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Turns `a` toward `b` by fraction `k` the short way round. */
function turn(a: number, b: number, k: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/**
 * One frame of sitting/standing. Returns where the bear's feet go (and its facing) this frame, plus
 * the state to keep, or null when it isn't in a chair at all.
 */
export function seatStep(
  move: SeatMove | null,
  want: CatanSeat | null,
  feet: { x: number; y: number; z: number },
  yaw: number,
  dt: number,
  animator: BearAnimator,
  start: (a: BearAction) => void,
): { x: number; y: number; z: number; yaw?: number; move: SeatMove | null } | null {
  if (!move) {
    if (!want) return null;
    move = { seat: want, phase: "in", t: 0, from: { ...feet } };
    start("sit");
  }
  const s = move.seat;
  move.t += dt;

  if (move.phase !== "out" && !want) {
    // Asked to get up.
    move = { ...move, phase: "out", t: 0, from: { x: s.sitX, y: s.y, z: s.sitZ } };
    start("stand");
  }
  if (move.phase === "in") {
    const k = smooth(move.t / WALK_IN);
    if (move.t >= WALK_IN) move.phase = "seated";
    return { x: move.from.x + (s.sitX - move.from.x) * k, y: s.y, z: move.from.z + (s.sitZ - move.from.z) * k, yaw: turn(yaw, s.yaw, Math.min(1, dt * 10)), move };
  }
  if (move.phase === "seated") return { x: s.sitX, y: s.y, z: s.sitZ, yaw: s.yaw, move };

  const k = smooth((move.t - OUT_DELAY) / OUT_TIME);
  const done = animator.finished("StandUp") || move.t > 3;
  if (done) start("locomotion");
  return { x: s.sitX + (s.standX - s.sitX) * k, y: s.y, z: s.sitZ + (s.standZ - s.sitZ) * k, yaw: s.yaw, move: done ? null : move };
}
