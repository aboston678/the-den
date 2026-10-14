import { type BowlFrame, LANE, laneById, laneToWorld } from "@den/shared";
import { Quaternion, Vector3 } from "three";
import { playAt } from "../audio/audio.ts";
import { type LaneRender, laneRender } from "./laneState.ts";
import { useLanes } from "./store.ts";

// Another bear's ball and pins (GAME_SPEC §15 "Sync"): their browser runs the physics and streams
// where everything is ~20 times a second; we glide our copy toward the latest positions so it
// looks smooth, and play the sounds that came with it. Lanes we're bowling on ourselves are
// driven by our own physics instead (see `drivenHere`).

interface Target {
  ball: { p: Vector3; q: Quaternion; visible: boolean };
  pins: { p: Vector3; q: Quaternion; gone: boolean }[];
  sweep: { down: number; x: number };
  /** A frame arrived and hasn't been reached yet. */
  live: boolean;
}

const fresh = (): Target => ({
  ball: { p: new Vector3(), q: new Quaternion(), visible: false },
  pins: Array.from({ length: 10 }, () => ({ p: new Vector3(), q: new Quaternion(), gone: false })),
  sweep: { down: 0, x: 0 },
  live: false,
});
const targets: Record<"1" | "2", Target> = { "1": fresh(), "2": fresh() };

/** Lanes whose ball and pins this browser is simulating right now (our own roll). */
export const drivenHere: Record<"1" | "2", boolean> = { "1": false, "2": false };

const SOUND: Record<string, [string, number, number, number]> = {
  // name, lane x, volume, range
  roll: ["ball-roll", 0, 0.9, 10],
  crash: ["pin-strike", LANE.headPin, 1.1, 9],
  tap: ["pin-strike", LANE.headPin, 0.6, 9],
  sweep: ["sweep", LANE.headPin, 0.6, 6],
  return: ["ball-return", -3.4, 0.6, 5],
};

/** A frame from another bowler (via the server). */
export function applyRemoteFrame(f: BowlFrame) {
  if (drivenHere[f.lane]) return;
  const t = targets[f.lane];
  if (f.b) {
    t.ball.p.set(f.b[0]!, f.b[1]!, f.b[2]!);
    t.ball.q.set(f.b[3]!, f.b[4]!, f.b[5]!, f.b[6]!);
  }
  t.ball.visible = !!f.b;
  if (f.p) {
    t.pins.forEach((pin, i) => {
      const o = i * 7;
      pin.p.set(f.p![o]!, f.p![o + 1]!, f.p![o + 2]!);
      pin.q.set(f.p![o + 3]!, f.p![o + 4]!, f.p![o + 5]!, f.p![o + 6]!);
    });
  }
  t.pins.forEach((pin, i) => (pin.gone = (f.g & (1 << i)) !== 0));
  t.sweep.down = f.s[0];
  t.sweep.x = f.s[1];
  t.live = true;
  const s = f.snd && SOUND[f.snd];
  if (s) {
    const at = laneToWorld(laneById(f.lane)!, s[1], 0.3, 0);
    void playAt(s[0], at[0], at[1], at[2], s[2], s[3]);
  }
}

/** Glide a lane's ball and pins toward the latest streamed positions (call every frame). */
export function followRemote(id: "1" | "2", dt: number) {
  const t = targets[id];
  if (drivenHere[id] || !t.live) return;
  const r: LaneRender = laneRender[id];
  const k = 1 - Math.exp(-14 * dt);
  // A ball that just appeared jumps straight to its spot; otherwise it glides.
  if (t.ball.visible && !r.ball.visible) r.ball.p.copy(t.ball.p), r.ball.q.copy(t.ball.q);
  else r.ball.p.lerp(t.ball.p, k), r.ball.q.slerp(t.ball.q, k);
  r.ball.visible = t.ball.visible;
  r.ball.colour = useLanes.getState().lanes[id].turn; // the bowler's colour, as on their side
  r.pins.forEach((pin, i) => {
    const want = t.pins[i]!;
    if (pin.gone && !want.gone) pin.p.copy(want.p), pin.q.copy(want.q);
    else pin.p.lerp(want.p, k), pin.q.slerp(want.q, k);
    pin.gone = want.gone;
  });
  r.sweep.down += (t.sweep.down - r.sweep.down) * k;
  r.sweep.x += (t.sweep.x - r.sweep.x) * k;
}

/** The frame our own browser streams for a lane we're bowling on. */
export function frameOf(id: "1" | "2", snd?: BowlFrame["snd"]): BowlFrame {
  const r = laneRender[id];
  // Kept inside the box the server accepts (shared/src/bowling/sync.ts), so one stray pin can't drop a frame.
  const at = (v: Vector3) => [clamp(v.x, -5.9, LANE.pitEdge + LANE.pitDepth + 0.4), clamp(v.y, -0.99, 1.99), clamp(v.z, -1.19, 1.19)];
  const b = r.ball.visible ? [...at(r.ball.p), r.ball.q.x, r.ball.q.y, r.ball.q.z, r.ball.q.w] : null;
  const p = r.pins.flatMap((pin) => [...at(pin.p), pin.q.x, pin.q.y, pin.q.z, pin.q.w]);
  const g = r.pins.reduce((m, pin, i) => m | (pin.gone ? 1 << i : 0), 0);
  return { lane: id, b, p, g, s: [r.sweep.down, r.sweep.x], ...(snd ? { snd } : {}) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
