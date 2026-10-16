import { type Object3D, Quaternion, Vector3 } from "three";

// Posing an arm on top of whatever clip is playing: turn the upper arm and forearm (in world space)
// so the paw reaches a point, the elbow bending toward a hint direction. Used to hold a fish up by
// its lip and to grip a motorcycle's handlebars.

const v = { a: new Vector3(), b: new Vector3(), p: new Vector3(), s: new Vector3(), e: new Vector3(), h: new Vector3(), d: new Vector3(), pole: new Vector3() };
const q = { d: new Quaternion(), w: new Quaternion(), p: new Quaternion(), i: new Quaternion() };

/** Turn `bone` (in world space) so the direction from it to `from` points at `to` instead, by `k` (0…1). */
export function aim(bone: Object3D, from: Vector3, to: Vector3, k: number) {
  const o = bone.getWorldPosition(v.p);
  v.a.subVectors(from, o).normalize();
  v.b.subVectors(to, o).normalize();
  q.d.setFromUnitVectors(v.a, v.b);
  q.d.slerp(q.i.identity(), 1 - k);
  bone.getWorldQuaternion(q.w);
  bone.parent!.getWorldQuaternion(q.p);
  bone.quaternion.copy(q.p.invert().multiply(q.d.multiply(q.w)));
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone reach: the paw (`hand` bone) goes to `target` (or as near as the arm allows), the elbow
 * bending toward `hint` (a world direction). `k` blends from the clip's pose (0) to the reach (1).
 */
export function reachTo(upper: Object3D, fore: Object3D, hand: Object3D, target: Vector3, hint: Vector3, k: number) {
  const s = upper.getWorldPosition(v.s), e = fore.getWorldPosition(v.e), h = hand.getWorldPosition(v.h);
  const l1 = s.distanceTo(e), l2 = e.distanceTo(h);
  const dir = v.d.subVectors(target, s);
  const d = Math.min(dir.length(), (l1 + l2) * 0.97);
  dir.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const pole = v.pole.copy(hint);
  pole.addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbow = s.clone().addScaledVector(dir, along).addScaledVector(pole, out);
  const reach = s.clone().addScaledVector(dir, d);
  aim(upper, e.clone(), elbow, k);
  aim(fore, hand.getWorldPosition(new Vector3()), reach, k);
}
