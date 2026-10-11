import { BEAR } from "@den/shared";

// Tuning for the character controller and camera (GAME_SPEC §5.3).

/** Natural ground speed / timing of the bear's clips, measured with tools/measure-clips.mjs. */
export const CLIP = {
  walkNaturalSpeed: 0.71, // m/s at timeScale 1
  runNaturalSpeed: 6.55,
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
} as const;

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
