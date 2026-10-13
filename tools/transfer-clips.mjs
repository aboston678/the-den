// Move animation clips from one bear onto a DIFFERENT bear (the cartoon remake, 2026-10-13), so the
// 14 clips bought for the realistic bear can be reused instead of bought again.
//
// Both bears are Higgsfield rigs with the same joint names, built in an A-pose. For every frame,
// each joint turns from its own A-pose by the same amount, in world space, as the clip's joint
// turns from the clip's A-pose. Bone lengths stay the new bear's own; the hips' movement is scaled
// by how much taller or shorter the new bear's hips are.
// (tools/retarget-clip.mjs is the exact method for clips made on the SAME mesh.)
//
// Usage: node tools/transfer-clips.mjs target.glb out.glb Name=clip.glb [Name=clip.glb ...]

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { Matrix4, Quaternion, Vector3 } from "three";
import { clipTimes, localMatricesAt, readSkin, worldMatrices } from "./lib/gltf-anim.mjs";

const [targetFile, outFile, ...clipArgs] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target = await io.read(targetFile);
const tSkin = readSkin(target);
const buffer = target.getRoot().listBuffers()[0];

const decompose = (m) => {
  const p = new Vector3(), q = new Quaternion(), s = new Vector3();
  m.decompose(p, q, s);
  return { p, q, s };
};
// A-pose world transform of each joint: the inverse of its inverse-bind matrix.
const bindOf = (skin) => skin.ibm.map((m) => decompose(m.clone().invert()));
const tBind = bindOf(tSkin);
const tStaticWorld = worldMatrices(target, localMatricesAt(target, null, 0)); // the Armature etc.
const HIPS = "Hips";

for (const arg of clipArgs) {
  const [name, file] = arg.split("=");
  const source = await io.read(file);
  const sSkin = readSkin(source);
  const sBind = bindOf(sSkin);
  const anim = source.getRoot().listAnimations()[0];
  const sByName = new Map(sSkin.joints.map((j, i) => [j.getName(), i]));
  const times = clipTimes(anim);
  const ti = tSkin.joints.findIndex((j) => j.getName() === HIPS), si = sByName.get(HIPS);
  const legRatio = tBind[ti].p.y / sBind[si].p.y;

  const tracks = tSkin.joints.map(() => ({ t: [], r: [], s: [] }));
  for (const time of times) {
    const sWorld = worldMatrices(source, localMatricesAt(source, anim, time));
    const want = new Map(); // joint -> desired world matrix this frame
    const solve = (i) => {
      const joint = tSkin.joints[i];
      if (want.has(joint)) return want.get(joint);
      const k = sByName.get(joint.getName());
      if (k === undefined) throw new Error(`clip ${file} has no joint ${joint.getName()}`);
      const now = decompose(sWorld.get(sSkin.joints[k]));
      // How far the clip's joint has turned from its A-pose, applied to ours.
      const turn = now.q.clone().multiply(sBind[k].q.clone().invert());
      const rot = turn.multiply(tBind[i].q.clone());
      let pos;
      const parent = joint.getParentNode();
      const pi = tSkin.index.get(parent);
      if (joint.getName() === HIPS || pi === undefined) {
        pos = tBind[i].p.clone().add(now.p.clone().sub(sBind[k].p).multiplyScalar(legRatio));
      } else {
        // Our bone length: the A-pose offset from the parent, carried along by the parent's new transform.
        const bindLocal = new Matrix4().compose(tBind[pi].p, tBind[pi].q, tBind[pi].s).invert()
          .multiply(new Matrix4().compose(tBind[i].p, tBind[i].q, tBind[i].s));
        pos = new Vector3().setFromMatrixPosition(bindLocal).applyMatrix4(solve(pi));
      }
      const m = new Matrix4().compose(pos, rot, tBind[i].s);
      want.set(joint, m);
      return m;
    };
    tSkin.joints.forEach((_, i) => solve(i));
    // Local transforms relative to each joint's parent node.
    tSkin.joints.forEach((joint, i) => {
      const parent = joint.getParentNode();
      const parentWorld = want.get(parent) ?? tStaticWorld.get(parent) ?? new Matrix4();
      const { p, q, s } = decompose(parentWorld.clone().invert().multiply(want.get(joint)));
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
  console.log(`${name}: ${times.length} frames, ${times.at(-1).toFixed(2)} s, hips ×${legRatio.toFixed(2)}, from ${file}`);
}

await io.write(outFile, target);
console.log(`wrote ${outFile}`);
