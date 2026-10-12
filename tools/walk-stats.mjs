// How a walk clip moves the body: does it travel on its own (root motion), stride, hip bob.
// Usage: node tools/walk-stats.mjs client/public/models/bear.glb Walk Run
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Vector3 } from "three";
import { clipTimes, localMatricesAt, worldMatrices } from "./lib/gltf-anim.mjs";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const nodes = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
const hips = nodes.get("Hips"), toes = ["LeftToeBase", "RightToeBase"].map((n) => nodes.get(n));
for (const name of process.argv.slice(3)) {
  const anim = doc.getRoot().listAnimations().find((a) => a.getName() === name);
  const t = clipTimes(anim);
  const at = (tt) => { const w = worldMatrices(doc, localMatricesAt(doc, anim, tt)); return { h: new Vector3().setFromMatrixPosition(w.get(hips)), f: toes.map((f) => new Vector3().setFromMatrixPosition(w.get(f))) }; };
  const a = at(t[0]), b = at(t.at(-1));
  // step length: max separation of feet along z
  let maxSep = 0, minHy = 9, maxHy = -9;
  for (const tt of t) { const s = at(tt); maxSep = Math.max(maxSep, Math.abs(s.f[0].z - s.f[1].z)); minHy = Math.min(minHy, s.h.y); maxHy = Math.max(maxHy, s.h.y); }
  console.log(`${name}: length ${t.at(-1).toFixed(2)} s, hips moved x ${(b.h.x - a.h.x).toFixed(2)} z ${(b.h.z - a.h.z).toFixed(2)} m, hip bob ${(maxHy - minHy).toFixed(3)} m, max foot spread ${maxSep.toFixed(2)} m`);
}
