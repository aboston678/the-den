// Compare two rigged GLBs joint by joint: bind-pose position offset (cm) and orientation (degrees).
// Usage: node tools/compare-bind.mjs a.glb b.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { Matrix4, Quaternion, Vector3 } from "three";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
async function bind(file) {
  const skin = (await io.read(file)).getRoot().listSkins()[0];
  const ibm = skin.getInverseBindMatrices();
  const out = {};
  skin.listJoints().forEach((j, i) => {
    const p = new Vector3(), q = new Quaternion(), s = new Vector3();
    new Matrix4().fromArray(ibm.getElement(i, new Array(16))).invert().decompose(p, q, s);
    out[j.getName()] = { p, q };
  });
  return out;
}
const [a, b] = await Promise.all(process.argv.slice(2, 4).map(bind));
let worstDeg = 0, worstCm = 0;
for (const k of Object.keys(a)) {
  const deg = (a[k].q.angleTo(b[k].q) * 180) / Math.PI;
  const cm = a[k].p.distanceTo(b[k].p) * 100;
  worstDeg = Math.max(worstDeg, deg); worstCm = Math.max(worstCm, cm);
}
console.log(`${process.argv[2].split("/").pop()} vs ${process.argv[3].split("/").pop()}: worst joint ${worstDeg.toFixed(1)}° / ${worstCm.toFixed(1)} cm`);
