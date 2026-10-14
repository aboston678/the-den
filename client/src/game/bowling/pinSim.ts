import RAPIER from "@dimforge/rapier3d-compat";
import { BALL, BALL_PHYSICS, type BallState, LANE, PIN, PIN_SPOTS } from "@den/shared";
import { Quaternion, Vector3 } from "three";
import type { LaneRender, PinPose } from "./laneState.ts";
import { PIN_PROFILE } from "./models.ts";

// The crash at the pins (GAME_SPEC §15): a small Rapier world of its own for one lane, in lane
// coordinates (x from the foul line, y up from the lane, z across; metres), stepped at a fixed
// 120 Hz so it plays out the same at any frame rate. The ball arrives from the lane model
// (shared/src/bowling/ball.ts) with its speed and spin; pins are 1.6 kg with their weight low,
// like real ones. Runs in the bowler's browser (and in unit tests); other players see the
// streamed result.

const STEP = 1 / 120;
const IN = 0.0254;
/** A pin counts as standing if it leans less than this and is still on the deck. */
const STAND_TILT = Math.cos((12 * Math.PI) / 180);
/** Physics settings, tuned by pinSim.test.ts so a pocket hit usually strikes and a nose hit splits. */
export const PIN_PHYSICS = {
  pinFriction: 0.35,
  pinRestitution: 0.55,
  deckFriction: 0.22,
  ballFriction: 0.2,
  ballRestitution: 0.25,
  /** Each pin is set down this far (±metres) from its spot, so no two racks are quite the same. */
  rackJitter: 0.004,
};

let ready: Promise<void> | null = null;
/** Rapier's WebAssembly must be loaded once before making a world. */
export const rapierReady = () => (ready ??= RAPIER.init());

/** The pin's outline as a cloud of points round its axis (a convex hull of the lathe profile). */
function pinPoints(segments = 10) {
  const pts: number[] = [];
  for (const [h, r] of PIN_PROFILE) {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(Math.cos(a) * r * IN, h * IN, Math.sin(a) * r * IN);
    }
  }
  return new Float32Array(pts);
}
const PIN_POINTS = pinPoints();

export class PinDeck {
  readonly world: RAPIER.World;
  private pins: (RAPIER.RigidBody | null)[] = [];
  private ball: RAPIER.RigidBody | null = null;
  private acc = 0;
  /** Seconds since the ball arrived. */
  time = 0;
  private quietFor = 0;

  constructor(private rand: () => number = Math.random) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.world.numSolverIterations = 8;
    this.buildDeck();
  }

  private fixed(hx: number, hy: number, hz: number, x: number, y: number, z: number, friction = PIN_PHYSICS.deckFriction) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(friction), body);
  }

  /** Pin deck, gutters, kickbacks, the pit and the cushion at its back. */
  private buildDeck() {
    const x0 = BALL_PHYSICS.handoverX - 0.6, x1 = LANE.pitEdge;
    const half = LANE.width / 2, side = half + LANE.gutter, back = LANE.pitEdge + LANE.pitDepth;
    this.fixed((x1 - x0) / 2, 0.05, half, (x0 + x1) / 2, -0.05, 0); // deck
    for (const s of [-1, 1]) {
      this.fixed((x1 - x0) / 2, 0.05, LANE.gutter / 2, (x0 + x1) / 2, -LANE.gutterDepth - 0.05, s * (half + LANE.gutter / 2)); // gutter
      this.fixed((back - x0) / 2, 0.5, 0.05, (x0 + back) / 2, 0.3, s * (side + 0.05), 0.3); // kickback
    }
    this.fixed((back - x1) / 2, 0.05, side, (x1 + back) / 2, -0.45, 0, 0.6); // pit floor
    this.fixed(0.05, 0.6, side, back + 0.05, 0.1, 0, 0.6); // back cushion
  }

  /** Set the pins: all ten fresh, or (second ball) only those still standing, upright where they stood. */
  rack(standing: PinPose[] | null) {
    for (const p of this.pins) if (p) this.world.removeRigidBody(p);
    this.pins = PIN_SPOTS.map((spot, i) => {
      const prev = standing?.[i];
      if (prev?.gone) return null;
      const j = () => (this.rand() * 2 - 1) * PIN_PHYSICS.rackJitter;
      const x = (prev ? prev.p.x : spot.x) + j(), z = (prev ? prev.p.z : spot.z) + j();
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 0.001, z).setCanSleep(true));
      const hull = RAPIER.ColliderDesc.convexHull(PIN_POINTS)!
        .setFriction(PIN_PHYSICS.pinFriction)
        .setRestitution(PIN_PHYSICS.pinRestitution)
        // Real pins carry their weight low (centre of mass ~5.75 in up).
        .setMassProperties(PIN.mass, { x: 0, y: 5.75 * IN, z: 0 }, { x: 0.017, y: 0.0021, z: 0.017 }, { x: 0, y: 0, z: 0, w: 1 });
      this.world.createCollider(hull, body);
      body.sleep();
      return body;
    });
  }

  /** The ball arrives from the lane model. */
  launch(b: BallState) {
    if (this.ball) this.world.removeRigidBody(this.ball); // last ball's still in the pit
    this.acc = 0;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(b.x, BALL.radius + 0.002, b.z)
      .setLinvel(b.vx, 0, b.vz)
      .setAngvel({ x: b.wx, y: 0, z: b.wz })
      .setCcdEnabled(true);
    this.ball = this.world.createRigidBody(desc);
    const density = BALL.mass / ((4 / 3) * Math.PI * BALL.radius ** 3);
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL.radius).setDensity(density).setFriction(PIN_PHYSICS.ballFriction).setRestitution(PIN_PHYSICS.ballRestitution),
      this.ball,
    );
    this.time = 0;
    this.quietFor = 0;
  }

  /** Advance by dt seconds of game time (fixed steps inside). */
  step(dt: number) {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= STEP) {
      this.world.step();
      this.acc -= STEP;
      this.time += STEP;
      this.quietFor = this.moving() ? 0 : this.quietFor + STEP;
    }
  }

  private moving() {
    for (const p of this.pins) {
      if (!p || p.isSleeping()) continue;
      const v = p.linvel(), w = p.angvel();
      if (p.translation().y > -0.3 && (Math.hypot(v.x, v.y, v.z) > 0.03 || Math.hypot(w.x, w.y, w.z) > 0.3)) return true;
    }
    const b = this.ball;
    return !!b && b.translation().x < LANE.pitEdge && Math.hypot(b.linvel().x, b.linvel().z) > 0.05;
  }

  /** Has everything stopped (or long enough passed)? */
  settled() {
    return (this.time > 1.6 && this.quietFor > 0.5) || this.time > 6;
  }

  /** Which pins are standing: upright, on the deck. */
  standing(): boolean[] {
    const up = new Vector3(), q = new Quaternion();
    return this.pins.map((p) => {
      if (!p) return false;
      const t = p.translation(), r = p.rotation();
      up.set(0, 1, 0).applyQuaternion(q.set(r.x, r.y, r.z, r.w));
      return up.y > STAND_TILT && t.y > -0.02 && t.y < 0.03 && t.x < LANE.pitEdge && Math.abs(t.z) < LANE.width / 2;
    });
  }

  /** Copy the pins and ball into the lane's render state. */
  write(r: LaneRender) {
    this.pins.forEach((p, i) => {
      const pose = r.pins[i]!;
      if (!p) return void (pose.gone = true);
      const t = p.translation(), q = p.rotation();
      pose.p.set(t.x, t.y, t.z);
      pose.q.set(q.x, q.y, q.z, q.w);
      pose.gone = t.y < -0.3; // down in the pit
    });
    if (this.ball) {
      const t = this.ball.translation(), q = this.ball.rotation();
      r.ball.p.set(t.x, t.y, t.z);
      r.ball.q.set(q.x, q.y, q.z, q.w);
      r.ball.visible = t.y > -0.5;
    }
  }

  dispose() {
    this.world.free();
  }
}
