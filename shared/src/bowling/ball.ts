import { BALL, LANE } from "./lane.ts";

// The ball's trip down the lane (GAME_SPEC §15), in lane coordinates (x from the foul line toward
// the pins, z across, metres). A real bowling ball skids, then hooks, then rolls: friction at the
// contact point works against the slip between the ball's surface and the lane until the ball is
// rolling. The front of the lane is oiled (very little friction), so a spinning ball goes nearly
// straight there and grabs the dry back end late, which is what makes it hook into the pins.
// Pure and step-by-step, so it runs the same everywhere and can be tuned in unit tests. When the
// ball reaches the pins the pin physics (Rapier, in the browser) takes over with its velocity and spin.

export interface BallState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Spin (rad/s) about the lane's x axis (side roll: what makes it hook) and z axis (forward roll). */
  wx: number;
  wz: number;
  /** Fallen into a gutter: rolls straight on to the pit, can't hit pins. */
  gutter: boolean;
}

export const BALL_PHYSICS = {
  /** Friction on the oiled front of the lane and on the dry back end. */
  oilFriction: 0.04,
  dryFriction: 0.2,
  /** Gravity (m/s²). */
  g: 9.81,
  /** A solid-ish ball's moment of inertia, as a fraction of m r² (bowling balls are ~0.4). */
  inertia: 0.4,
  /** Where the pin physics takes over (lane x): just before the head pin. */
  handoverX: LANE.headPin - 0.45,
} as const;

/** Friction coefficient at lane x. */
export const frictionAt = (x: number) => (x < LANE.oil ? BALL_PHYSICS.oilFriction : BALL_PHYSICS.dryFriction);

/** Centre z where the ball tips into a gutter (its centre is past the lane edge). */
const GUTTER_EDGE = LANE.width / 2;

/** Advance the ball by dt seconds (changes `b`). */
export function stepBall(b: BallState, dt: number) {
  if (b.gutter) {
    b.x += b.vx * dt;
    b.wz = -b.vx / BALL.radius;
    return;
  }
  const R = BALL.radius;
  // Slip of the ball's surface over the lane at the contact point: v + ω × (0, −R, 0).
  const ux = b.vx + b.wz * R;
  const uz = b.vz - b.wx * R;
  const slip = Math.hypot(ux, uz);
  if (slip > 1e-4) {
    const mu = frictionAt(b.x);
    // Friction decelerates the slip; it can't overshoot to zero within one step.
    const a = mu * BALL_PHYSICS.g; // linear deceleration (m/s²)
    // Slip changes at a·(1 + 1/k) per second (linear + angular parts), k = inertia factor.
    const slipRate = a * (1 + 1 / BALL_PHYSICS.inertia);
    const f = Math.min(1, (slipRate * dt) / slip); // fraction of the slip removed this step
    const dux = -ux * f, duz = -uz * f;
    // Split the change: the linear part is 1/(1 + 1/k) of it, the spin part the rest.
    const lin = 1 / (1 + 1 / BALL_PHYSICS.inertia);
    b.vx += dux * lin;
    b.vz += duz * lin;
    b.wz += (dux * (1 - lin)) / R;
    b.wx -= (duz * (1 - lin)) / R;
  }
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  if (Math.abs(b.z) > GUTTER_EDGE) {
    b.gutter = true;
    b.z = Math.sign(b.z) * (LANE.width / 2 + LANE.gutter / 2);
    b.vz = 0;
    b.wx = 0;
  }
}

/** Ball height above the lane surface (its centre): on the lane, or down in a gutter. */
export const ballY = (b: BallState) => (b.gutter ? BALL.radius - LANE.gutterDepth : BALL.radius);

/** Has the ball reached the pins (or, in a gutter, the pit)? */
export const reachedPins = (b: BallState) => b.x >= (b.gutter ? LANE.pitEdge : BALL_PHYSICS.handoverX);
