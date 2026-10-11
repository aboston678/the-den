// Move animation clips made on a different rig of the SAME bear mesh onto our bear's skeleton.
//
// Higgsfield re-rigs the mesh for every extra clip, and each rig puts the joints in slightly
// different places (up to ~23° / 15 cm). Copying the clip as-is would bend the wrong spots.
// Instead, for every frame we make our skeleton deform the mesh exactly like the clip's own
// rig does:  ourJointWorld = theirJointWorld × theirInverseBind × inverse(ourInverseBind).
//
// Usage: node tools/retarget-clip.mjs target.glb out.glb Name=clip.glb [Name=clip.glb ...]

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { Matrix4, Quaternion, Vector3 } from "three";
import { clipTimes, localMatricesAt, readSkin, worldMatrices } from "./lib/gltf-anim.mjs";

const [targetFile, outFile, ...clipArgs] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target = await io.read(targetFile);
const tSkin = readSkin(target);
const tRoot = target.getRoot();
const buffer = tRoot.listBuffers()[0];

for (const arg of clipArgs) {
  const [name, file] = arg.split("=");
  const source = await io.read(file);
  const sSkin = readSkin(source);
  const anim = source.getRoot().listAnimations()[0];
  const sByName = new Map(sSkin.joints.map((j, i) => [j.getName(), i]));
  const times = clipTimes(anim);

  // Static world matrices of the target's non-joint ancestors (e.g. the Armature node).
  const tStaticWorld = worldMatrices(target, localMatricesAt(target, null, 0));

  const tracks = tSkin.joints.map(() => ({ t: [], r: [], s: [] }));
  for (const time of times) {
    const sWorld = worldMatrices(source, localMatricesAt(source, anim, time));
    // Desired world matrix for each of our joints.
    const want = new Map();
    tSkin.joints.forEach((joint, i) => {
      const si = sByName.get(joint.getName());
      if (si === undefined) throw new Error(`clip ${file} has no joint ${joint.getName()}`);
      const m = sWorld.get(sSkin.joints[si]).clone().multiply(sSkin.ibm[si]).multiply(tSkin.ibm[i].clone().invert());
      want.set(joint, m);
    });
    // Convert to local transforms relative to each joint's parent.
    tSkin.joints.forEach((joint, i) => {
      const parent = joint.getParentNode();
      const parentWorld = want.get(parent) ?? tStaticWorld.get(parent) ?? new Matrix4();
      const local = parentWorld.clone().invert().multiply(want.get(joint));
      const p = new Vector3(), q = new Quaternion(), s = new Vector3();
      local.decompose(p, q, s);
      const tr = tracks[i];
      const prev = tr.r.length ? tr.r.slice(-4) : null;
      if (prev && prev[0] * q.x + prev[1] * q.y + prev[2] * q.z + prev[3] * q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      tr.t.push(p.x, p.y, p.z);
      tr.r.push(q.x, q.y, q.z, q.w);
      tr.s.push(s.x, s.y, s.z);
    });
  }

  const input = target.createAccessor(`${name}_time`).setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer);
  const out = target.createAnimation(name);
  tSkin.joints.forEach((joint, i) => {
    for (const [path, key, type] of [["translation", "t", "VEC3"], ["rotation", "r", "VEC4"], ["scale", "s", "VEC3"]]) {
      const output = target.createAccessor(`${name}_${joint.getName()}_${path}`).setType(type)
        .setArray(new Float32Array(tracks[i][key])).setBuffer(buffer);
      const sampler = target.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
      out.addSampler(sampler).addChannel(target.createAnimationChannel().setTargetNode(joint).setTargetPath(path).setSampler(sampler));
    }
  });
  console.log(`${name}: ${times.length} frames, ${times.at(-1).toFixed(2)} s, from ${file}`);
}

await io.write(outFile, target);
console.log(`wrote ${outFile}`);
