import { BEAR } from "@den/shared";
import { TOON } from "./artStyle.ts";

// Tuning for the character controller and camera (GAME_SPEC §5.3).

/**
 * Natural ground speed / timing of the bear's clips, measured with tools/measure-clips.mjs and then
 * tuned with e2e/controller.spec.ts (least planted-foot slide). The cartoon bear's legs are shorter:
 * its walk measures 0.60 m/s (best: 0.62); its run measures 4.0 but slides least at 6.0, about the
 * same as the realistic bear's. The clips' timing is the same on both bears.
 */
export const CLIP = {
  walkNaturalSpeed: TOON ? 0.62 : 0.95, // m/s at timeScale 1 (walking_2, Andrew's pick 2026-10-12; was Casual_Walk 0.71)
  runNaturalSpeed: TOON ? 6.0 : 6.55,
  jumpTakeoff: 0.57, // s into the Jump clip where the feet leave the ground
  jumpLand: 1.1,
} as const;

export const MOVE = {
  walkSpeed: BEAR.walkSpeed,
  sprintSpeed: BEAR.sprintSpeed,
  acceleration: 14, // m/s² toward the target speed
  turnSpeed: 10, // rad/s the bear turns to face where it's going
  gravity: BEAR.gravity,
  jumpVelocity: Math.sqrt(2 * BEAR.gravity * BEAR.jumpApexM),
  roarCooldown: 3, // s
  /** Bumping (GAME_SPEC §5.3): soft shove when touching, much stronger from a sprinting bear. */
  shove: 2, // m/s
  sprintShove: 6, // m/s extra
  staggerTime: 0.35, // s of slowed movement after a sprint shove
} as const;

/** Seconds a jump spends in the air. */
export const JUMP_AIR_TIME = (2 * MOVE.jumpVelocity) / MOVE.gravity;

/** Capsule matching the 2.1 m bear. */
export const CAPSULE = {
  radius: 0.45,
  halfHeight: BEAR.heightM / 2 - 0.45,
} as const;
/** Rapier keeps the capsule this far off the ground (its "skin"); the model is lowered to match. */
export const CONTROLLER_OFFSET = 0.02;
/** Height of the capsule's centre above the bear's feet (including the skin gap). */
export const CAPSULE_CENTER = CAPSULE.halfHeight + CAPSULE.radius + CONTROLLER_OFFSET;

export const CAMERA = {
  fov: 70,
  distance: 3.5,
  minDistance: 2,
  maxDistance: 6,
  targetHeight: 1.75, // look at the bear's shoulders
  minPitch: -0.35, // rad, looking up from below
  maxPitch: 1.1, // rad, looking down from above
  sensitivity: 0.0025, // rad per pixel of mouse movement
  wallPadding: 0.3, // keep this far in front of walls
} as const;

export const CROSSFADE = 0.15; // s
