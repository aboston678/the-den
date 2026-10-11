// Check a retargeted clip by skinning the mesh on the CPU and comparing vertex positions:
//   reference = the clip's own file (its mesh, rig and animation)
//   retarget  = our bear with the retargeted clip
//   naive     = our bear with the original clip copied straight across by bone name
// Usage: node tools/verify-retarget.mjs clip.glb retargeted.glb ClipName
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { Matrix4, Vector3 } from "three";
import { clipTimes, localMatricesAt, readSkin, worldMatrices } from "./lib/gltf-anim.mjs";

const [clipFile, retargetedFile, clipName] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const ref = await io.read(clipFile);
const ours = await io.read(retargetedFile);

function skinned(doc, local) {
  const { joints, ibm } = readSkin(doc);
  const world = worldMatrices(doc, local);
  const k = joints.map((j, i) => world.get(j).clone().multiply(ibm[i]));
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const pos = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
  const out = new Float32Array(pos.getCount() * 3);
  const p = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0], v = new Vector3(), acc = new Vector3();
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, p); J.getElement(i, j); W.getElement(i, w);
    acc.set(0, 0, 0);
    for (let n = 0; n < 4; n++) if (w[n]) acc.addScaledVector(v.set(...p).applyMatrix4(k[j[n]]), w[n]);
    out.set([acc.x, acc.y, acc.z], i * 3);
  }
  return out;
}

/** Our bear's node TRS driven by the reference clip's channels, matched by node name. */
function naiveLocal(time) {
  const refLocal = localMatricesAt(ref, ref.getRoot().listAnimations()[0], time);
  const byName = new Map([...refLocal].map(([n, m]) => [n.getName(), m]));
  const local = localMatricesAt(ours, null, 0);
  for (const node of readSkin(ours).joints) if (byName.has(node.getName())) local.set(node, byName.get(node.getName()));
  return local;
}

const diff = (a, b) => {
  let max = 0, sum = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]);
    max = Math.max(max, d); sum += d;
  }
  return { max: max * 100, mean: (sum / (a.length / 3)) * 100 };
};

const refAnim = ref.getRoot().listAnimations()[0];
const ourAnim = ours.getRoot().listAnimations().find((a) => a.getName() === clipName);
const times = clipTimes(refAnim);
const picks = [0, 0.25, 0.5, 0.75, 1].map((f) => times[Math.round(f * (times.length - 1))]);
for (const t of picks) {
  const r = skinned(ref, localMatricesAt(ref, refAnim, t));
  const good = diff(r, skinned(ours, localMatricesAt(ours, ourAnim, t)));
  const bad = diff(r, skinned(ours, naiveLocal(t)));
  console.log(`${clipName} t=${t.toFixed(2)}s  retargeted: mean ${good.mean.toFixed(1)} cm, max ${good.max.toFixed(1)} cm   |   naive copy: mean ${bad.mean.toFixed(1)} cm, max ${bad.max.toFixed(1)} cm`);
}

// Where are the biggest errors? Group vertices by their strongest bone (in our rig).
if (process.env.WHERE) {
  const t = picks[0];
  const r = skinned(ref, localMatricesAt(ref, refAnim, t));
  const o = skinned(ours, localMatricesAt(ours, ourAnim, t));
  const { joints } = readSkin(ours);
  const prim = ours.getRoot().listMeshes()[0].listPrimitives()[0];
  const J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
  const groups = new Map(); const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  let over5 = 0;
  for (let i = 0; i < r.length / 3; i++) {
    const d = Math.hypot(r[i * 3] - o[i * 3], r[i * 3 + 1] - o[i * 3 + 1], r[i * 3 + 2] - o[i * 3 + 2]) * 100;
    if (d > 5) over5++;
    J.getElement(i, j); W.getElement(i, w);
    const bone = joints[j[w.indexOf(Math.max(...w))]].getName();
    const g = groups.get(bone) ?? { n: 0, sum: 0, max: 0 };
    g.n++; g.sum += d; g.max = Math.max(g.max, d); groups.set(bone, g);
  }
  console.log(`vertices off by more than 5 cm: ${((over5 / (r.length / 3)) * 100).toFixed(1)}%`);
  for (const [bone, g] of [...groups].sort((a, b) => b[1].max - a[1].max).slice(0, 8)) {
    console.log(`  ${bone.padEnd(14)} ${String(g.n).padStart(6)} verts  mean ${(g.sum / g.n).toFixed(1)} cm  max ${g.max.toFixed(1)} cm`);
  }
}
