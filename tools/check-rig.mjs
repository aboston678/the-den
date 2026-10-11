// Rig test (milestone 1.4): do several GLBs share the same skeleton?
// Compares bone names, parents and rest poses against the first file.
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
  const bones = new Map();
  for (const joint of skin.listJoints()) {
    const parent = joint.getParentNode();
    bones.set(joint.getName(), {
      parent: parent?.getName() ?? null,
      t: joint.getTranslation(),
      r: joint.getRotation(),
    });
  }
  const clips = root.listAnimations().map((a) => `${a.getName()} (${a.listChannels().length} channels)`);
  return { bones, clips };
}

const close = (a, b, eps) => a.every((v, i) => Math.abs(v - b[i]) <= eps);
const [baseFile, ...others] = process.argv.slice(2);
const base = await skeleton(baseFile);
console.log(`${baseFile}: ${base.bones.size} bones, clips: ${base.clips.join(", ")}`);

let ok = true;
for (const file of others) {
  const other = await skeleton(file);
  const problems = [];
  for (const [name, b] of base.bones) {
    const o = other.bones.get(name);
    if (!o) { problems.push(`missing bone ${name}`); continue; }
    if (o.parent !== b.parent) problems.push(`${name}: parent ${o.parent} vs ${b.parent}`);
    if (!close(o.t, b.t, 0.05)) problems.push(`${name}: rest position differs`);
    if (!close(o.r, b.r, 0.01) && !close(o.r, b.r.map((v) => -v), 0.01)) problems.push(`${name}: rest rotation differs`);
  }
  for (const name of other.bones.keys()) if (!base.bones.has(name)) problems.push(`extra bone ${name}`);
  console.log(`\n${file}: ${other.bones.size} bones, clips: ${other.clips.join(", ")}`);
  console.log(problems.length ? `  MISMATCH:\n  - ${problems.join("\n  - ")}` : "  skeleton matches ✓");
  if (problems.length) ok = false;
}
process.exit(ok ? 0 : 1);
