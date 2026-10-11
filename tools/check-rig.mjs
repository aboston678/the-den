// Rig test (milestone 1.4): do several GLBs share the same skeleton?
// Compares bone names, parents and bind poses (inverse bind matrices) against the first file.
// (A bone's node transform is just the first animation frame, so it is NOT compared.)
//
// Usage: node tools/check-rig.mjs base.glb other.glb [...]

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function skeleton(file) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  if (!skin) throw new Error(`${file}: no skin`);
  const ibm = skin.getInverseBindMatrices();
  const bones = new Map();
  skin.listJoints().forEach((joint, i) => {
    bones.set(joint.getName(), {
      parent: joint.getParentNode()?.getName() ?? null,
      bind: ibm.getElement(i, new Array(16)),
    });
  });
  const clips = root.listAnimations().map((a) => `${a.getName()} (${a.listChannels().length} channels)`);
  return { bones, clips };
}

// Matrix entries: rotation part is unitless, translation part (12-14) is in metres.
const bindDiff = (a, b) => ({
  rot: Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map((i) => Math.abs(a[i] - b[i]))),
  pos: Math.max(...[12, 13, 14].map((i) => Math.abs(a[i] - b[i]))),
});
const [baseFile, ...others] = process.argv.slice(2);
const base = await skeleton(baseFile);
console.log(`${baseFile}: ${base.bones.size} bones, clips: ${base.clips.join(", ")}`);

let ok = true;
for (const file of others) {
  const other = await skeleton(file);
  const problems = [];
  let worst = 0;
  for (const [name, b] of base.bones) {
    const o = other.bones.get(name);
    if (!o) { problems.push(`missing bone ${name}`); continue; }
    if (o.parent !== b.parent) problems.push(`${name}: parent ${o.parent} vs ${b.parent}`);
    const d = bindDiff(o.bind, b.bind);
    worst = Math.max(worst, d.pos);
    if (d.rot > 0.01 || d.pos > 0.01) problems.push(`${name}: bind pose differs (rot ${d.rot.toFixed(4)}, pos ${d.pos.toFixed(4)} m)`);
  }
  for (const name of other.bones.keys()) if (!base.bones.has(name)) problems.push(`extra bone ${name}`);
  console.log(`\n${file}: ${other.bones.size} bones, clips: ${other.clips.join(", ")}`);
  console.log(problems.length ? `  MISMATCH:\n  - ${problems.join("\n  - ")}` : `  skeleton matches ✓ (largest bind-pose offset ${(worst * 1000).toFixed(2)} mm)`);
  if (problems.length) ok = false;
}
process.exit(ok ? 0 : 1);
