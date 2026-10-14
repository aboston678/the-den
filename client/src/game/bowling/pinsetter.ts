import { LANE, PIN_SPOTS } from "@den/shared";
import type { LaneRender } from "./laneState.ts";

// The pinsetter after a ball (GAME_SPEC §15): the sweep bar drops in front of the pins, the pins
// still standing are lifted, the bar sweeps the fallen ones into the pit, then either the standing
// pins are set back down where they stood (after a first ball) or a fresh rack of ten comes down
// (end of a frame). Visual only: the next ball's physics starts from the result.

const LOWER = 0.45, LIFT_AT = 0.3, SWEEP_FROM = 0.8, SWEEP_TO = 1.7, SET_FROM = 1.8, SET_TO = 2.4, DONE = 2.8;
const LIFT = 0.32;
const BAR_START = LANE.headPin - 0.35, BAR_END = LANE.pitEdge + 0.2;

export class Pinsetter {
  t = 0;
  private lifted: boolean[];
  private home: { x: number; z: number }[];

  /**
   * `standing`: which pins are still up. `fresh`: rack all ten afterwards (end of a frame) instead
   * of setting the standing ones back down.
   */
  constructor(private r: LaneRender, private standing: boolean[], private fresh: boolean) {
    this.lifted = standing.map((s) => s && !fresh);
    this.home = r.pins.map((p) => ({ x: p.p.x, z: p.p.z }));
  }

  /** Advance; true when finished. */
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t, r = this.r;
    const ease = (a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    // The bar comes down, sweeps back, and lifts away at the end.
    r.sweep.down = Math.min(ease(0, LOWER), 1 - ease(SET_TO, DONE));
    r.sweep.x = BAR_START + (BAR_END - BAR_START) * ease(SWEEP_FROM, SWEEP_TO) * (1 - ease(SET_FROM, SET_TO));
    r.pins.forEach((pin, i) => {
      if (this.lifted[i]) {
        // Standing pins: up out of the way, then back down on the same spot, upright.
        const up = Math.min(ease(LIFT_AT, SWEEP_FROM), 1 - ease(SET_FROM, SET_TO));
        pin.p.set(this.home[i]!.x, LIFT * up, this.home[i]!.z);
        pin.q.identity();
        return;
      }
      // Fallen pins (and, at the end of a frame, all of them) go into the pit as the bar passes.
      if (!pin.gone && t > SWEEP_FROM && r.sweep.x > pin.p.x - 0.05) pin.gone = true;
      if (this.fresh && t >= SET_FROM) {
        // A new rack comes down from above.
        const s = PIN_SPOTS[i]!;
        pin.gone = false;
        pin.p.set(s.x, LIFT * (1 - ease(SET_FROM, SET_TO)), s.z);
        pin.q.identity();
      }
    });
    if (t > SWEEP_FROM) r.ball.visible = false;
    return t >= DONE;
  }
}
