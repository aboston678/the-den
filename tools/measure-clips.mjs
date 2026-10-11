// Measure the bear's clips so the game can avoid foot sliding:
//  - natural ground speed of looping locomotion clips (how fast the planted foot moves back)
//  - Jump: when the feet leave and return to the ground
// Usage: node tools/measure-clips.mjs [client/public/models/bear.glb]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Vector3 } from "three";
import { clipTimes, localMatricesAt, worldMatrices } from "./lib/gltf-anim.mjs";

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(process.argv[2] ?? "client/public/models/bear.glb");
const nodes = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
const feet = ["LeftToeBase", "RightToeBase"].map((n) => nodes.get(n));

function track(anim) {
  const times = clipTimes(anim);
  return times.map((t) => {
    const world = worldMatrices(doc, localMatricesAt(doc, anim, t));
    return { t, feet: feet.map((f) => new Vector3().setFromMatrixPosition(world.get(f))) };
  });
}

for (const name of ["Walk", "Run"]) {
  const anim = doc.getRoot().listAnimations().find((a) => a.getName() === name);
  const frames = track(anim);
  // The planted foot is the lower one; its backward speed (along -z, the bear faces +z) is ground speed.
  let dist = 0, time = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i];
    const k = b.feet[0].y < b.feet[1].y ? 0 : 1;
    const dz = a.feet[k].z - b.feet[k].z;
    if (dz > 0) { dist += dz; time += b.t - a.t; }
  }
  const lowest = Math.min(...frames.flatMap((f) => f.feet.map((p) => p.y)));
  console.log(`${name}: natural ground speed ≈ ${(dist / time).toFixed(2)} m/s over ${frames.at(-1).t.toFixed(2)} s (lowest toe ${lowest.toFixed(3)} m)`);
}

const jump = track(doc.getRoot().listAnimations().find((a) => a.getName() === "Jump"));
const ground = Math.min(...jump.map((f) => Math.min(f.feet[0].y, f.feet[1].y)));
const air = jump.filter((f) => Math.min(f.feet[0].y, f.feet[1].y) > ground + 0.08);
const peak = jump.reduce((m, f) => (Math.min(f.feet[0].y, f.feet[1].y) > Math.min(m.feet[0].y, m.feet[1].y) ? f : m));
console.log(`Jump: feet leave ≈ ${air[0]?.t.toFixed(2)} s, land ≈ ${air.at(-1)?.t.toFixed(2)} s, peak ${(Math.min(peak.feet[0].y, peak.feet[1].y) - ground).toFixed(2)} m at ${peak.t.toFixed(2)} s`);
