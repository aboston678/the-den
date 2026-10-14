import { create } from "zustand";
import { playerState } from "../state.ts";

// Your own bowling turn, step by step (GAME_SPEC §15, Andrew's meter controls): which lane you've
// joined, where you're standing and aiming, the two meters, and the big banner after a ball.
// Drawn by the HUD (ui/BowlingHud.tsx); driven by BowlingControls.tsx.

export type BowlMode =
  | "off" // not on a lane
  | "wait" // on a lane, someone else's turn (or between balls)
  | "aim" // A/D to slide, mouse to aim, click to start the power meter
  | "power" // power meter bouncing: click to stop it
  | "curve" // curve meter swinging: click to stop it
  | "throw" // the bear is bowling
  | "roll" // the ball is on its way
  | "pins" // the crash, waiting for the pins to settle
  | "sweep"; // the pinsetter is clearing up

export interface BowlUi {
  lane: "1" | "2" | null;
  mode: BowlMode;
  /** Where you stand across the approach (lane z, metres) and the aim arrow (degrees). */
  z: number;
  aim: number;
  /** The meters: live while moving, then where they stopped. */
  power: number;
  curve: number;
  /** "[E] …" prompt near the ball return. */
  prompt: string | null;
  /** STRIKE! / SPARE! / GUTTER / 7 pins, with when it appeared (performance.now ms). */
  banner: { text: string; big: boolean; at: number } | null;
}

export const useBowling = create<BowlUi>(() => ({
  lane: null, mode: "off", z: 0.2, aim: 0, power: 0, curve: 0, prompt: null, banner: null,
}));

/** Meter shapes over time: power bounces 0→1→0 every 1.2 s; curve swings −1…1 every 1.6 s. */
export const POWER_PERIOD = 1.2, CURVE_PERIOD = 1.6;
export const powerAt = (t: number) => 1 - Math.abs(((t / POWER_PERIOD) % 1) * 2 - 1);
export const curveAt = (t: number) => Math.sin((2 * Math.PI * t) / CURVE_PERIOD);

/** The one mouse button: start the power meter, stop it, stop the curve meter (and bowl). */
export function click() {
  const ui = useBowling.getState();
  if (ui.mode === "aim") useBowling.setState({ mode: "power", power: 0 });
  else if (ui.mode === "power") useBowling.setState({ mode: "curve", curve: 0 });
  else if (ui.mode === "curve") {
    useBowling.setState({ mode: "throw" });
    playerState.bowlRequest = true;
  }
}
