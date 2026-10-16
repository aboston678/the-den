import { type Object3D, Vector3 } from "three";
import { reachTo } from "../player/reach.ts";

// Holding a landed fish up by its lip (game-night fixes): the bear's left arm reaches out to the side
// and a little forward at shoulder height, so the fish hangs where the camera behind the bear can see
// it. Applied on top of whatever clip is playing (the rod stays in the right paw), easing in and out.
// The left paw's position each frame is published for FishingLines to hang the fish from.

/** Where each bear's left paw is while it holds a fish ("me" for our own bear). */
export const lipHands = new Map<string, { hand: Vector3; yaw: number; weight: number }>();

/** How far past the wrist bone the paw's grip is (metres, along the arm). */
const PAW = 0.14;

interface Arm {
  upper: Object3D;
  fore: Object3D;
  hand: Object3D;
  weight: number;
}
const arms = new WeakMap<Object3D, Arm | null>();

const UP = new Vector3(0, 1, 0);
const v = { s: new Vector3(), h: new Vector3(), e: new Vector3(), t: new Vector3(), f: new Vector3(), l: new Vector3(), a: new Vector3(), b: new Vector3() };

/**
 * Call after the bear's animation has updated this frame. `holding`: a landed fish is in its paw;
 * `free`: the arm may take the pose (not while a clip like the celebration wants both arms).
 */
export function applyLipHold(id: string, model: Object3D, yaw: number, holding: boolean, free: boolean, dt: number) {
  let arm = arms.get(model);
  if (arm === undefined) {
    const upper = model.getObjectByName("LeftArm"), fore = model.getObjectByName("LeftForeArm"), hand = model.getObjectByName("LeftHand");
    arm = upper && fore && hand ? { upper, fore, hand, weight: 0 } : null;
    arms.set(model, arm);
  }
  if (!arm) return;
  const want = holding && free ? 1 : 0;
  arm.weight += Math.sign(want - arm.weight) * Math.min(Math.abs(want - arm.weight), dt * 4);
  if (!holding && arm.weight === 0) {
    lipHands.delete(id);
    return;
  }
  model.updateWorldMatrix(true, true); // the bear's group may have moved and turned this frame
  const k = arm.weight * arm.weight * (3 - 2 * arm.weight); // smoothstep
  if (k > 0) {
    // The arm held out nearly straight to the bear's left, a little forward and down from the shoulder;
    // the elbow bends a little down and back.
    const s = arm.upper.getWorldPosition(v.s), e = arm.fore.getWorldPosition(v.e), h = arm.hand.getWorldPosition(v.h);
    const reach = (s.distanceTo(e) + e.distanceTo(h)) * 0.94;
    v.f.set(Math.sin(yaw), 0, Math.cos(yaw)); // forward
    v.l.set(Math.cos(yaw), 0, -Math.sin(yaw)); // the bear's left
    const target = v.t.set(0, 0, 0).addScaledVector(v.l, 0.8).addScaledVector(v.f, 0.5).addScaledVector(UP, -0.25).normalize().multiplyScalar(reach).add(s);
    reachTo(arm.upper, arm.fore, arm.hand, target, v.b.set(0, -1, 0).addScaledVector(v.f, -0.4), k);
  }
  const r = lipHands.get(id) ?? { hand: new Vector3(), yaw: 0, weight: 0 };
  // The grip: a little past the wrist, along the forearm.
  const wrist = arm.hand.getWorldPosition(v.h), elbowNow = arm.fore.getWorldPosition(v.e);
  r.hand.copy(wrist).addScaledVector(v.a.subVectors(wrist, elbowNow).normalize(), PAW);
  r.yaw = yaw;
  r.weight = k;
  lipHands.set(id, r);
}
