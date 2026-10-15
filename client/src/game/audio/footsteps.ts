import type { BearAnimator } from "../player/BearAnimator.ts";
import { playerState } from "../state.ts";
import { playAt, take } from "./audio.ts";
import { floorAt, type Floor } from "./floor.ts";

// Footsteps and landings (GAME_SPEC §10): played where the bear is, in time with its walk or run,
// sounding like what it's standing on. Your own bear and every other bear within earshot.

/** Other bears' steps aren't played past this distance (metres). */
const EARSHOT = 22;
/** Some floors are naturally louder; this keeps them even. */
const FLOOR_GAIN: Record<Floor, number> = { grass: 0.8, dirt: 0.9, stone: 0.8, wood: 1, carpet: 0.8 };

export function bearSounds(animator: BearAnimator, x: number, y: number, z: number) {
  const e = animator.events;
  const step = e.step, land = e.land;
  e.step = null;
  e.land = false;
  if (!step && !land) return;
  const me = playerState.position;
  if (Math.hypot(x - me.x, y - me.y, z - me.z) > EARSHOT) return;
  const floor = floorAt(x, y + 0.2, z);
  if (step) void playAt(take(`step-${floor}`, 5), x, y + 0.05, z, (step === "run" ? 0.85 : 0.5) * FLOOR_GAIN[floor], 3);
  if (land) void playAt("land", x, y + 0.05, z, 0.7, 4);
}
