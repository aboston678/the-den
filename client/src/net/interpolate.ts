import type { BearAction } from "@den/shared";
import type { Snapshot } from "./remotes.ts";

/** How far in the past remote bears are drawn, so there's always an update on each side. */
export const INTERP_DELAY_MS = 100;

export interface Sample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  action: BearAction;
  flashlight: boolean;
  aimYaw: number;
  aimPitch: number;
  wheelie: number;
}

/** Blend between angles the short way round. */
export function lerpAngle(a: number, b: number, f: number) {
  const d = (((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * f;
}

/**
 * Where a remote bear was at time `t` (ms, performance.now clock), blended between the two
 * snapshots around it. Before the first snapshot: the first. After the last: hold the last.
 */
export function sampleAt(snaps: readonly Snapshot[], t: number): Sample | null {
  if (snaps.length === 0) return null;
  const first = snaps[0]!, last = snaps[snaps.length - 1]!;
  if (t <= first.t) return first;
  if (t >= last.t) return last;
  let i = snaps.length - 2;
  while (i > 0 && snaps[i]!.t > t) i--;
  const a = snaps[i]!, b = snaps[i + 1]!;
  const f = (t - a.t) / (b.t - a.t || 1);
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    z: a.z + (b.z - a.z) * f,
    yaw: lerpAngle(a.yaw, b.yaw, f),
    speed: a.speed + (b.speed - a.speed) * f,
    action: a.action, // switch actions only once the newer snapshot is reached
    flashlight: a.flashlight,
    aimYaw: lerpAngle(a.aimYaw, b.aimYaw, f),
    aimPitch: a.aimPitch + (b.aimPitch - a.aimPitch) * f,
    wheelie: a.wheelie + (b.wheelie - a.wheelie) * f,
  };
}
