import type { BallState } from "./ball.ts";
import { BALL, STANCE } from "./lane.ts";

// From the meters to a rolling ball (GAME_SPEC §15, Andrew's meter controls): where the bear
// stands (A/D), the aim arrow (mouse), where the POWER meter stopped and where the CURVE meter
// stopped. On top of the player's own timing there's a little luck: a small random scatter in aim
// (bigger the harder you throw), a small wobble on the speed and the curve. VARIABILITY scales it all.

export interface ThrowInput {
  /** Where the bear stands across the approach (lane z, metres). */
  z: number;
  /** Aim angle, degrees: positive = toward +z (right, as you face the pins). */
  aim: number;
  /** POWER meter, 0…1. */
  power: number;
  /** CURVE meter, −1 (hooks left) … 0 (straight) … 1 (hooks right). */
  curve: number;
}

export const THROW = {
  /** Aim arrow limits (degrees): ±3° already reaches from gutter to gutter at the pins. */
  maxAim: 3,
  /** Ball speed at the bottom and top of the power meter (m/s). Real bowlers throw ~7–9. */
  minSpeed: 5.2,
  maxSpeed: 9.6,
  /** Side spin at a full curve (rad/s about the lane's axis). */
  maxSideSpin: 18,
  /** Forward roll the ball leaves the hand with, as a fraction of a full roll (it skids at first). */
  launchRoll: 0.25,
} as const;

/** How much luck there is. 0 = exactly what the meters say; 1 = normal. */
export const VARIABILITY = 1;

/** Random aim scatter (± degrees) at a power: ±5 cm at the pins for a gentle ball, ±14 cm flat out (the pocket is ~6 cm wide). */
export const aimScatter = (power: number) => VARIABILITY * (0.15 + 0.3 * power);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The ball as it leaves the bear's paw at the foul line. `rand` returns 0…1 (Math.random in the game). */
export function throwBall(input: ThrowInput, rand: () => number = Math.random): BallState {
  const power = clamp(input.power, 0, 1);
  const wobble = () => rand() * 2 - 1; // −1…1
  const aim = clamp(input.aim, -THROW.maxAim, THROW.maxAim) + wobble() * aimScatter(power);
  const speed = (THROW.minSpeed + (THROW.maxSpeed - THROW.minSpeed) * power) * (1 + 0.03 * VARIABILITY * wobble());
  const curve = clamp(input.curve, -1, 1) * (1 + 0.05 * VARIABILITY * wobble());
  const a = (aim * Math.PI) / 180;
  const vx = speed * Math.cos(a), vz = speed * Math.sin(a);
  return {
    x: 0,
    z: clamp(input.z, -STANCE.maxZ, STANCE.maxZ),
    vx,
    vz,
    // Partial forward roll (wz < 0 rolls toward +x), and side roll for the hook.
    wz: (-THROW.launchRoll * vx) / BALL.radius,
    wx: curve * THROW.maxSideSpin,
    gutter: false,
  };
}
