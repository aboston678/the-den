// Pure movement math for the bear (no three.js objects, easy to unit-test).

export interface MoveInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Camera-relative direction on the ground. `cameraYaw` is the camera's orbit angle around the
 * bear: 0 puts the camera on the +z side looking toward -z, so "forward" is -z.
 * Returns a unit vector, or {x:0,z:0} when no keys (or opposite keys) are held.
 */
export function moveDirection(input: MoveInput, cameraYaw: number): { x: number; z: number } {
  const f = Number(input.forward) - Number(input.back);
  const r = Number(input.right) - Number(input.left);
  if (f === 0 && r === 0) return { x: 0, z: 0 };
  const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  const x = -sin * f + cos * r;
  const z = -cos * f - sin * r;
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
}

/** Facing angle (rotation about y) for a model that faces +z by default. */
export function facingYaw(dir: { x: number; z: number }) {
  return Math.atan2(dir.x, dir.z);
}

/** Turn `current` toward `target` by at most `maxStep` radians, the short way round. */
export function turnToward(current: number, target: number, maxStep: number) {
  let diff = ((target - current + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  if (Math.abs(diff) <= maxStep) return target;
  diff = Math.sign(diff) * maxStep;
  return current + diff;
}

/** Move `current` toward `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number) {
  return current < target ? Math.min(target, current + maxDelta) : Math.max(target, current - maxDelta);
}

/** Idle / walk / run weights (summing to 1) for a ground speed. */
export function locomotionWeights(speed: number, walkSpeed: number, sprintSpeed: number) {
  if (speed <= 0.05) return { idle: 1, walk: 0, run: 0 };
  if (speed <= walkSpeed) {
    const t = speed / walkSpeed;
    return { idle: 1 - t, walk: t, run: 0 };
  }
  const t = Math.min(1, (speed - walkSpeed) / (sprintSpeed - walkSpeed));
  return { idle: 0, walk: 1 - t, run: t };
}
