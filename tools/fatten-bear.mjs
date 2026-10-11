// Make the bear a bit fatter without touching its skeleton, so every animation clip still fits.
//
// Each vertex is pushed away from the body's centre line (per height slice) in the horizontal
// plane. How far depends on how strongly the vertex follows the torso bones: belly, chest and
// hips get the full amount, thighs and shoulders some, paws and head none.
//
// The front of the belly (vertices ahead of the centre line on the hips/spine) gets `belly` extra.
//
// Usage: node tools/fatten-bear.mjs [amount=0.22] [belly=0.15] [in] [out]

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const amount = Number(process.argv[2] ?? 0.22);
const belly = Number(process.argv[3] ?? 0.15);
const input = process.argv[4] ?? "assets/models/bear/bear-base-original.glb";
const output = process.argv[5] ?? "client/public/models/bear-base.glb";

// How much each bone's influence counts toward "torso" (0 = untouched, 1 = full amount).
const TORSO_FACTOR = {
  Hips: 1, Spine: 1, Spine01: 1, Spine02: 1,
  LeftUpLeg: 0.6, RightUpLeg: 0.6,
  LeftShoulder: 0.5, RightShoulder: 0.5,
  neck: 0.35,
  LeftArm: 0.3, RightArm: 0.3,
};
const CORE = new Set(["Hips", "Spine", "Spine01", "Spine02"]);
const SLICES = 60;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const skinNode = root.listNodes().find((n) => n.getMesh() && n.getSkin());
if (!skinNode) throw new Error("no skinned mesh found");
const skinJoints = skinNode.getSkin().listJoints();
const jointFactor = skinJoints.map((j) => TORSO_FACTOR[j.getName()] ?? 0);
const jointIsCore = skinJoints.map((j) => (CORE.has(j.getName()) ? 1 : 0));

for (const prim of skinNode.getMesh().listPrimitives()) {
  const pos = prim.getAttribute("POSITION");
  const joints = prim.getAttribute("JOINTS_0");
  const weights = prim.getAttribute("WEIGHTS_0");
  const n = pos.getCount();
  const minY = pos.getMin([])[1];
  const maxY = pos.getMax([])[1];
  const slice = (y) => Math.min(SLICES - 1, Math.max(0, Math.floor(((y - minY) / (maxY - minY)) * SLICES)));

  const p = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  const torso = new Float32Array(n);
  const core = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    joints.getElement(i, j);
    weights.getElement(i, w);
    torso[i] = Math.min(1, j.reduce((sum, joint, k) => sum + w[k] * jointFactor[joint], 0));
    core[i] = Math.min(1, j.reduce((sum, joint, k) => sum + w[k] * jointIsCore[joint], 0));
  }

  // Centre line: weighted centroid of torso vertices in each height slice.
  const cx = new Float64Array(SLICES), cz = new Float64Array(SLICES), cw = new Float64Array(SLICES);
  for (let i = 0; i < n; i++) {
    if (torso[i] < 0.5) continue;
    pos.getElement(i, p);
    const s = slice(p[1]);
    cx[s] += p[0] * torso[i]; cz[s] += p[2] * torso[i]; cw[s] += torso[i];
  }
  // Fill empty slices from the nearest filled one, then smooth.
  const filled = [...cw.keys()].filter((s) => cw[s] > 0);
  const centre = Array.from({ length: SLICES }, (_, s) => {
    const near = filled.reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a));
    return [cx[near] / cw[near], cz[near] / cw[near]];
  });
  const smooth = centre.map((_, s) => {
    const win = centre.slice(Math.max(0, s - 3), s + 4);
    return [win.reduce((a, c) => a + c[0], 0) / win.length, win.reduce((a, c) => a + c[1], 0) / win.length];
  });

  for (let i = 0; i < n; i++) {
    if (torso[i] === 0) continue;
    pos.getElement(i, p);
    const [ox, oz] = smooth[slice(p[1])];
    const grow = 1 + amount * torso[i];
    const growZ = p[2] > oz ? grow + belly * core[i] : grow; // +z is the bear's front
    pos.setElement(i, [ox + (p[0] - ox) * grow, p[1], oz + (p[2] - oz) * growZ]);
  }
}

await io.write(output, doc);
console.log(`fattened by ${Math.round(amount * 100)}% (+${Math.round(belly * 100)}% belly) -> ${output}`);
