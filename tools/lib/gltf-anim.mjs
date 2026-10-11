// Small helpers for reading glTF skeletons and sampling animation clips with three.js math.
import { Matrix4, Quaternion, Vector3 } from "three";

/** Skin joints with their bind matrices (inverse of the inverse-bind matrix). */
export function readSkin(doc) {
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) throw new Error("no skin");
  const ibmAcc = skin.getInverseBindMatrices();
  const joints = skin.listJoints();
  const ibm = joints.map((_, i) => new Matrix4().fromArray(ibmAcc.getElement(i, new Array(16))));
  return { skin, joints, ibm, index: new Map(joints.map((j, i) => [j, i])) };
}

/** Sample one glTF animation sampler at time t (LINEAR / STEP; quaternions slerped). */
function sample(sampler, path, t) {
  const times = sampler.getInput().getArray();
  const out = sampler.getOutput().getArray();
  const size = path === "rotation" ? 4 : 3;
  const read = (k) => Array.from(out.slice(k * size, k * size + size));
  if (t <= times[0]) return read(0);
  const last = times.length - 1;
  if (t >= times[last]) return read(last);
  let k = 0;
  while (times[k + 1] < t) k++;
  const a = read(k), b = read(k + 1);
  if (sampler.getInterpolation() === "STEP") return a;
  const f = (t - times[k]) / (times[k + 1] - times[k]);
  if (path === "rotation") {
    const q = new Quaternion(...a).slerp(new Quaternion(...b), f);
    return [q.x, q.y, q.z, q.w];
  }
  return a.map((v, i) => v + (b[i] - v) * f);
}

/** Every keyframe time used anywhere in the clip, sorted. */
export function clipTimes(anim) {
  const set = new Set();
  for (const s of anim.listSamplers()) for (const t of s.getInput().getArray()) set.add(Math.round(t * 1e5) / 1e5);
  return [...set].sort((a, b) => a - b);
}

/** Local matrix of every node at time t (animated channels override the node's own TRS). */
export function localMatricesAt(doc, anim, t) {
  const trs = new Map();
  for (const node of doc.getRoot().listNodes()) {
    trs.set(node, { translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale() });
  }
  for (const ch of anim?.listChannels() ?? []) {
    const path = ch.getTargetPath();
    if (path === "weights") continue;
    trs.get(ch.getTargetNode())[path] = sample(ch.getSampler(), path, t);
  }
  const local = new Map();
  for (const [node, v] of trs) {
    local.set(node, new Matrix4().compose(new Vector3(...v.translation), new Quaternion(...v.rotation), new Vector3(...v.scale)));
  }
  return local;
}

/** World matrices from local ones (walks up parents). */
export function worldMatrices(doc, local) {
  const world = new Map();
  const get = (node) => {
    if (world.has(node)) return world.get(node);
    const parent = node.getParentNode();
    const m = parent ? get(parent).clone().multiply(local.get(node)) : local.get(node).clone();
    world.set(node, m);
    return m;
  };
  for (const node of doc.getRoot().listNodes()) get(node);
  return world;
}
